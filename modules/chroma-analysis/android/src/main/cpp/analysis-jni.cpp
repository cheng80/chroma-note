#include <jni.h>
#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"
#include "gpu-policy.h"
#include <android/log.h>
#include <dlfcn.h>
#include <vulkan/vulkan.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

// The pinned backend calls this Vulkan 1.1 entry directly. Resolve it at runtime
// so Android 24 devices can still load the library and use the CPU path.
extern "C" VKAPI_ATTR void VKAPI_CALL __wrap_vkGetPhysicalDeviceFeatures2(
        VkPhysicalDevice device, VkPhysicalDeviceFeatures2 * features) {
    static auto function = [] {
        void * library = dlopen("libvulkan.so", RTLD_NOW | RTLD_LOCAL);
        return library ? reinterpret_cast<PFN_vkGetPhysicalDeviceFeatures2>(
            dlsym(library, "vkGetPhysicalDeviceFeatures2")) : nullptr;
    }();
    if (!function) throw std::runtime_error("analysis_gpu_unsupported");
    function(device, features);
}

namespace {
struct Engine {
    std::atomic<bool> cancelled{false};
    llama_model * model = nullptr;
    mtmd_context * vision = nullptr;
    ggml_backend_dev_t gpu = nullptr;
    bool gpuRejected = false;
    std::string modelPath, visionPath;
    void unload() {
        if (vision) mtmd_free(vision);
        if (model) llama_model_free(model);
        vision = nullptr; model = nullptr; gpu = nullptr;
    }
    ~Engine() { unload(); }
    void check() const { if (cancelled.load()) throw std::runtime_error("analysis_cancelled"); }
};

using Clock = std::chrono::steady_clock;
long long elapsed(Clock::time_point start) {
    return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - start).count();
}
ggml_backend_dev_t selectGpu() {
    for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
        auto device = ggml_backend_dev_get(i);
        auto type = ggml_backend_dev_type(device);
        if (chroma::hardwareVulkan(ggml_backend_reg_name(ggml_backend_dev_backend_reg(device)),
                                  ggml_backend_dev_description(device),
                                  type == GGML_BACKEND_DEVICE_TYPE_GPU || type == GGML_BACKEND_DEVICE_TYPE_IGPU)) return device;
    }
    return nullptr;
}

void discardLog(ggml_log_level, const char *, void *) {}
bool keepLoading(float, void * data) { return !static_cast<Engine *>(data)->cancelled.load(); }
bool abortDecode(void * data) { return static_cast<Engine *>(data)->cancelled.load(); }
int threadCount() { return static_cast<int>(std::max(1u, std::min(6u, std::max(2u, std::thread::hardware_concurrency()) - 1))); }
Engine & engine(jlong handle) {
    if (!handle) throw std::runtime_error("analysis_model_load_failed");
    return *reinterpret_cast<Engine *>(handle);
}
std::string utf(JNIEnv * env, jstring value) {
    const char * chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) throw std::bad_alloc();
    try {
        std::string result(chars);
        env->ReleaseStringUTFChars(value, chars);
        return result;
    } catch (...) {
        env->ReleaseStringUTFChars(value, chars);
        throw;
    }
}
void reject(JNIEnv * env, const char * code) {
    if (!env->ExceptionCheck()) env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), code);
}
void rejectCurrent(JNIEnv * env) {
    try { throw; }
    catch (const std::bad_alloc &) { reject(env, "analysis_out_of_memory"); }
    catch (const std::exception & error) {
        std::string message(error.what());
        reject(env, message.rfind("analysis_", 0) == 0 ? message.c_str() : "analysis_failed");
    }
    catch (...) { reject(env, "analysis_failed"); }
}

void prepare(Engine & e, const std::string & modelPath, const std::string & visionPath) {
    e.check();
    if (e.model && e.vision) return;
    static std::once_flag initialized;
    std::call_once(initialized, [] {
        llama_log_set(discardLog, nullptr);
        ggml_log_set(discardLog, nullptr);
        mtmd_helper_log_set(discardLog, nullptr);
        // Vulkan 1.0 loaders do not expose vkEnumerateInstanceVersion; do not enter
        // the pinned backend's 1.2 initialization path on such devices.
        auto enumerateVersion = reinterpret_cast<PFN_vkEnumerateInstanceVersion>(
            vkGetInstanceProcAddr(VK_NULL_HANDLE, "vkEnumerateInstanceVersion"));
        uint32_t version = 0;
        if (!enumerateVersion || enumerateVersion(&version) != VK_SUCCESS || version < VK_API_VERSION_1_2) {
            setenv("GGML_DISABLE_VULKAN", "1", 1);
        }
        llama_backend_init();
    });
    e.unload();
    e.modelPath = modelPath; e.visionPath = visionPath;
    e.gpu = e.gpuRejected ? nullptr : selectGpu();
    auto started = Clock::now();
    try {
        ggml_backend_dev_t devices[] = {e.gpu, nullptr};
        auto modelParams = llama_model_default_params();
        modelParams.devices = devices; // An empty list explicitly excludes GPU on CPU fallback.
        modelParams.n_gpu_layers = e.gpu ? 999 : 0;
        modelParams.split_mode = LLAMA_SPLIT_MODE_NONE;
        modelParams.load_mode = LLAMA_LOAD_MODE_MMAP;
        modelParams.progress_callback = keepLoading;
        modelParams.progress_callback_user_data = &e;
        e.model = llama_model_load_from_file(modelPath.c_str(), modelParams);
        e.check();
        if (!e.model) throw std::runtime_error("analysis_model_load_failed");
        auto visionParams = mtmd_context_params_default();
        visionParams.use_gpu = e.gpu != nullptr;
        visionParams.device = e.gpu;
        visionParams.image_max_tokens = 256;
        visionParams.n_threads = threadCount();
        visionParams.warmup = false;
        visionParams.progress_callback = keepLoading;
        visionParams.progress_callback_user_data = &e;
        e.vision = mtmd_init_from_file(visionPath.c_str(), e.model, visionParams);
        e.check();
        if (!e.vision || !mtmd_support_vision(e.vision)) throw std::runtime_error("analysis_vision_load_failed");
        __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s prepare_ms=%lld",
                            e.gpu ? "vulkan" : "cpu", elapsed(started));
    } catch (...) {
        bool retry = e.gpu && !e.cancelled.load();
        e.unload();
        if (!retry) throw;
        e.gpuRejected = true;
        __android_log_print(ANDROID_LOG_WARN, "ChromaAnalysis", "backend=cpu fallback=gpu_prepare_failed");
        prepare(e, modelPath, visionPath);
    }
}

std::string piece(const llama_vocab * vocab, llama_token token) {
    std::vector<char> buffer(64);
    int size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, false);
    if (size < 0) {
        buffer.resize(static_cast<size_t>(-size));
        size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, false);
    }
    return size > 0 ? std::string(buffer.data(), static_cast<size_t>(size)) : std::string();
}

std::string generate(Engine & e, const std::string & imagePath, const std::string & prompt, int maxTokens) {
    auto started = Clock::now();
    e.check();
    if (!e.model || !e.vision) throw std::runtime_error("analysis_model_load_failed");
    auto contextParams = llama_context_default_params();
    contextParams.n_ctx = 2048;
    contextParams.n_batch = 512;
    contextParams.n_ubatch = 128;
    contextParams.n_threads = threadCount();
    contextParams.n_threads_batch = threadCount();
    contextParams.offload_kqv = e.gpu != nullptr;
    contextParams.op_offload = e.gpu != nullptr;
    contextParams.abort_callback = abortDecode;
    contextParams.abort_callback_data = &e;
    std::unique_ptr<llama_context, decltype(&llama_free)> context(llama_init_from_model(e.model, contextParams), llama_free);
    if (!context) throw std::runtime_error("analysis_out_of_memory");

    auto image = mtmd_helper_bitmap_init_from_file(e.vision, imagePath.c_str(), false, mtmd_helper_init_opt_default());
    std::unique_ptr<mtmd_bitmap, decltype(&mtmd_bitmap_free)> bitmap(image.bitmap, mtmd_bitmap_free);
    if (image.video_ctx) mtmd_helper_video_free(image.video_ctx);
    if (!bitmap || image.video_ctx) throw std::runtime_error("analysis_invalid_image");
    std::string content = std::string(mtmd_default_marker()) + prompt;
    llama_chat_message message{"user", content.c_str()};
    auto chatTemplate = llama_model_chat_template(e.model, nullptr);
    int32_t size = llama_chat_apply_template(chatTemplate, &message, 1, true, nullptr, 0);
    if (size <= 0) throw std::runtime_error("analysis_prompt_failed");
    std::vector<char> formatted(static_cast<size_t>(size) + 1);
    llama_chat_apply_template(chatTemplate, &message, 1, true, formatted.data(), static_cast<int32_t>(formatted.size()));
    mtmd_input_text input{formatted.data(), static_cast<size_t>(size), true, true};
    const mtmd_bitmap * bitmaps[] = {bitmap.get()};
    std::unique_ptr<mtmd_input_chunks, decltype(&mtmd_input_chunks_free)> chunks(mtmd_input_chunks_init(), mtmd_input_chunks_free);
    if (!chunks || mtmd_tokenize(e.vision, chunks.get(), &input, bitmaps, 1) != 0) throw std::runtime_error("analysis_tokenize_failed");
    bitmap.reset();
    llama_pos nPast = 0;
    e.check();
    int status = mtmd_helper_eval_chunks(e.vision, context.get(), chunks.get(), 0, 0, contextParams.n_batch, true, &nPast);
    chunks.reset();
    e.check();
    if (status != 0) throw std::runtime_error("analysis_image_eval_failed");
    auto prefillMs = elapsed(started);

    std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(llama_sampler_chain_init(llama_sampler_chain_default_params()), llama_sampler_free);
    if (!sampler) throw std::runtime_error("analysis_out_of_memory");
    llama_sampler_chain_add(sampler.get(), llama_sampler_init_temp(0.2f));
    llama_sampler_chain_add(sampler.get(), llama_sampler_init_dist(17));
    auto vocab = llama_model_get_vocab(e.model);
    std::string output;
    int generatedTokens = 0;
    for (int index = 0; index < maxTokens; ++index) {
        e.check();
        llama_token token = llama_sampler_sample(sampler.get(), context.get(), -1);
        llama_sampler_accept(sampler.get(), token);
        if (llama_vocab_is_eog(vocab, token)) break;
        output += piece(vocab, token);
        ++generatedTokens;
        auto batch = llama_batch_get_one(&token, 1);
        status = llama_decode(context.get(), batch);
        e.check();
        if (status != 0) throw std::runtime_error("analysis_decode_failed");
    }
    if (output.empty()) throw std::runtime_error("analysis_no_valid_output");
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis",
                        "backend=%s prefill_ms=%lld decode_ms=%lld total_ms=%lld output_tokens=%d",
                        e.gpu ? "vulkan" : "cpu", prefillMs, elapsed(started) - prefillMs,
                        elapsed(started), generatedTokens);
    return output;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeCreate(JNIEnv * env, jobject) {
    try { return reinterpret_cast<jlong>(new Engine()); }
    catch (...) { rejectCurrent(env); return 0; }
}
extern "C" JNIEXPORT void JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeResetCancellation(JNIEnv * env, jobject, jlong handle) {
    try { engine(handle).cancelled.store(false); } catch (...) { rejectCurrent(env); }
}
extern "C" JNIEXPORT void JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeCancel(JNIEnv * env, jobject, jlong handle) {
    try { engine(handle).cancelled.store(true); } catch (...) { rejectCurrent(env); }
}
extern "C" JNIEXPORT void JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativePrepare(JNIEnv * env, jobject, jlong handle, jstring model, jstring vision) {
    try { prepare(engine(handle), utf(env, model), utf(env, vision)); } catch (...) { rejectCurrent(env); }
}
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeGenerate(JNIEnv * env, jobject, jlong handle, jstring image, jbyteArray rawPrompt, jint maxTokens) {
    try {
        auto length = env->GetArrayLength(rawPrompt);
        if (length <= 0 || length > 4800 || maxTokens < 8 || maxTokens > 128) throw std::runtime_error("analysis_invalid_request");
        std::string prompt(static_cast<size_t>(length), '\0');
        env->GetByteArrayRegion(rawPrompt, 0, length, reinterpret_cast<jbyte *>(prompt.data()));
        if (env->ExceptionCheck()) return nullptr;
        auto & e = engine(handle);
        auto imagePath = utf(env, image);
        std::string output;
        try { output = generate(e, imagePath, prompt, maxTokens); }
        catch (const std::exception & error) {
            if (!e.gpu || e.cancelled.load() ||
                (!chroma::retryOnCpu(error.what()) && dynamic_cast<const std::bad_alloc *>(&error) == nullptr)) throw;
            e.gpuRejected = true;
            e.unload();
            __android_log_print(ANDROID_LOG_WARN, "ChromaAnalysis", "backend=cpu fallback=gpu_generate_failed");
            prepare(e, e.modelPath, e.visionPath);
            output = generate(e, imagePath, prompt, maxTokens);
        }
        auto result = env->NewByteArray(static_cast<jsize>(output.size()));
        if (result) env->SetByteArrayRegion(result, 0, static_cast<jsize>(output.size()), reinterpret_cast<const jbyte *>(output.data()));
        return result;
    } catch (...) { rejectCurrent(env); return nullptr; }
}
extern "C" JNIEXPORT void JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeDestroy(JNIEnv *, jobject, jlong handle) {
    delete reinterpret_cast<Engine *>(handle);
}
