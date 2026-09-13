#include <jni.h>
#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"
// The batching helper is tied to our manifest-pinned llama.cpp revision.
#include "mtmd-helper-common.h"
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
#include <sys/stat.h>
#include <sys/sysinfo.h>
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
    ggml_backend_dev_t visionGpu = nullptr;
    bool memoryConstrained = false;
    unsigned graphNodes = 0;
    bool gpuRejected = false;
    std::string modelPath, visionPath;
    void unload() {
        if (vision) mtmd_free(vision);
        if (model) llama_model_free(model);
        vision = nullptr; model = nullptr; gpu = nullptr; visionGpu = nullptr;
    }
    ~Engine() { unload(); }
    void check() const { if (cancelled.load()) throw std::runtime_error("analysis_cancelled"); }
};

const char * backendName(const Engine & e) {
    return e.gpu ? "vulkan" : e.visionGpu ? "cpu+vulkan_vision" : "cpu";
}

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
                                  type == GGML_BACKEND_DEVICE_TYPE_GPU || type == GGML_BACKEND_DEVICE_TYPE_IGPU) &&
            !chroma::preferCpu(ggml_backend_dev_description(device))) return device;
    }
    return nullptr;
}

void discardLog(ggml_log_level, const char *, void *) {}
bool keepLoading(float, void * data) { return !static_cast<Engine *>(data)->cancelled.load(); }
bool abortDecode(void * data) { return static_cast<Engine *>(data)->cancelled.load(); }
bool checkGraph(ggml_tensor *, bool ask, void * data) {
    auto & e = *static_cast<Engine *>(data);
    // Split vision and language graphs at bounded intervals so a timed-out job can
    // finish cancellation before the following sketch asks to reclaim memory.
    return ask ? e.cancelled.load() || ++e.graphNodes % 32 == 0 : !e.cancelled.load();
}
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

llama_model * loadLanguage(Engine & e, ggml_backend_dev_t gpu, int layers) {
    ggml_backend_dev_t devices[] = {gpu, nullptr};
    auto params = llama_model_default_params();
    params.devices = devices;
    params.n_gpu_layers = layers;
    params.split_mode = LLAMA_SPLIT_MODE_NONE;
    params.load_mode = LLAMA_LOAD_MODE_MMAP;
    params.use_extra_bufts = !e.memoryConstrained;
    params.progress_callback = keepLoading;
    params.progress_callback_user_data = &e;
    return llama_model_load_from_file(e.modelPath.c_str(), params);
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
    struct sysinfo memory {};
    struct stat modelFile {}, visionFile {};
    const bool measured = sysinfo(&memory) == 0 && stat(modelPath.c_str(), &modelFile) == 0 &&
                          stat(visionPath.c_str(), &visionFile) == 0 && modelFile.st_size > 0 && visionFile.st_size > 0;
    const uint64_t totalMemory = measured ? static_cast<uint64_t>(memory.totalram) * memory.mem_unit : 0;
    const uint64_t weightBytes = measured ? static_cast<uint64_t>(modelFile.st_size) + visionFile.st_size : 0;
    const bool visionFits = measured && chroma::fitsGpuMemory(totalMemory, visionFile.st_size);
    auto availableGpu = e.gpuRejected || !visionFits ? nullptr : selectGpu();
    e.memoryConstrained = chroma::stageModels(totalMemory, weightBytes);
    e.gpu = !e.memoryConstrained ? availableGpu : nullptr;
    e.visionGpu = availableGpu;
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s memory_policy=%s ram_mib=%llu weights_mib=%llu",
                        backendName(e), e.memoryConstrained ? "staged" : "gpu_eligible",
                        static_cast<unsigned long long>(totalMemory / (1024 * 1024)),
                        static_cast<unsigned long long>(weightBytes / (1024 * 1024)));
    auto started = Clock::now();
    try {
        e.model = loadLanguage(e, e.gpu, e.gpu ? 999 : 0);
        e.check();
        if (!e.model) throw std::runtime_error("analysis_model_load_failed");
        auto visionParams = mtmd_context_params_default();
        visionParams.use_gpu = e.visionGpu != nullptr;
        visionParams.device = e.visionGpu;
        visionParams.image_max_tokens = 256;
        visionParams.n_threads = threadCount();
        visionParams.warmup = false;
        visionParams.progress_callback = keepLoading;
        visionParams.progress_callback_user_data = &e;
        if (e.memoryConstrained) {
            visionParams.cb_eval = checkGraph;
            visionParams.cb_eval_user_data = &e;
        }
        e.vision = mtmd_init_from_file(visionPath.c_str(), e.model, visionParams);
        e.check();
        if (!e.vision || !mtmd_support_vision(e.vision)) throw std::runtime_error("analysis_vision_load_failed");
        __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s prepare_ms=%lld",
                            backendName(e), elapsed(started));
    } catch (...) {
        bool retry = (e.gpu || e.visionGpu) && !e.cancelled.load();
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

struct EncodedImage {
    std::vector<float> embeddings;
    std::vector<mtmd_decoder_pos> positions;
    int tokens = 0;
    llama_pos positionCount = 0;
    bool nonCausal = false;
};

std::vector<EncodedImage> encodeImages(Engine & e, const mtmd_input_chunks * chunks) {
    const auto started = Clock::now();
    const int width = llama_model_n_embd_inp(e.model);
    std::vector<EncodedImage> images(mtmd_input_chunks_size(chunks));
    llama_pos position = 0;
    for (size_t i = 0; i < images.size(); ++i) {
        e.check();
        const auto chunk = mtmd_input_chunks_get(chunks, i);
        const auto type = mtmd_input_chunk_get_type(chunk);
        if (type == MTMD_INPUT_CHUNK_TYPE_IMAGE) {
            auto & image = images[i];
            image.tokens = static_cast<int>(mtmd_input_chunk_get_n_tokens(chunk));
            image.positionCount = mtmd_input_chunk_get_n_pos(chunk);
            if (width <= 0 || image.tokens <= 0 || image.tokens > 2048) throw std::runtime_error("analysis_invalid_image");
            image.nonCausal = mtmd_decode_use_non_causal(e.vision, chunk);
            if (mtmd_decode_use_mrope(e.vision)) {
                image.positions.resize(image.tokens);
                mtmd_helper_image_get_decoder_pos(mtmd_input_chunk_get_tokens_image(chunk), position, image.positions.data());
            }
            e.graphNodes = 0;
            __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s vision_start tokens=%d width=%d", backendName(e), image.tokens, width);
            const int status = mtmd_encode_chunk(e.vision, chunk);
            e.check();
            if (status != 0) throw std::runtime_error("analysis_image_eval_failed");
            const float * data = mtmd_get_output_embd(e.vision);
            if (!data) throw std::runtime_error("analysis_image_eval_failed");
            image.embeddings.assign(data, data + static_cast<size_t>(image.tokens) * width);
        } else if (type != MTMD_INPUT_CHUNK_TYPE_TEXT) {
            throw std::runtime_error("analysis_invalid_image");
        }
        position += mtmd_input_chunk_get_n_pos(chunk);
    }
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s vision_ms=%lld release=vision_before_language",
                        backendName(e), elapsed(started));
    mtmd_free(e.vision);
    e.vision = nullptr;
    e.visionGpu = nullptr;
    return images;
}

int decodeImage(llama_context * context, EncodedImage & image, int batchSize, llama_pos & position) {
    decode_embd_batch batch(image.embeddings.data(), image.tokens, image.positions.empty() ? 1 : 4,
                           llama_model_n_embd_inp(llama_get_model(context)));
    if (image.positions.empty()) batch.set_position_normal(position, 0);
    else batch.set_position_mrope_2d(image.positions, 0);
    if (image.nonCausal) llama_set_causal_attn(context, false);
    int status = 0;
    for (int offset = 0; offset < image.tokens && status == 0; offset += batchSize) {
        status = llama_decode(context, batch.get_view(offset, std::min(batchSize, image.tokens - offset)));
    }
    if (image.nonCausal) llama_set_causal_attn(context, true);
    if (status == 0) position += image.positionCount;
    return status;
}

void prepareLanguageGpu(Engine & e) {
    if (!e.memoryConstrained || e.gpuRejected) return;
    struct sysinfo memory {};
    struct stat modelFile {};
    if (sysinfo(&memory) != 0 || stat(e.modelPath.c_str(), &modelFile) != 0 || modelFile.st_size <= 0) return;
    const int totalLayers = llama_model_n_layer(e.model);
    const int layers = chroma::languageGpuLayers(static_cast<uint64_t>(memory.totalram) * memory.mem_unit,
                                               modelFile.st_size, totalLayers);
    auto gpu = layers > 0 ? selectGpu() : nullptr;
    if (!gpu) return;
    e.check();
    const auto started = Clock::now();
    // The image embeddings own their data now; the vision GPU allocation and
    // old CPU weight mapping are both gone before loading language GPU layers.
    llama_model_free(e.model);
    e.model = nullptr;
    e.gpu = gpu;
    e.model = loadLanguage(e, gpu, layers);
    e.check();
    if (!e.model) throw std::runtime_error("analysis_model_load_failed");
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=vulkan language_gpu_layers=%d/%d language_load_ms=%lld",
                        layers, totalLayers + 1, elapsed(started));
}

std::string generate(Engine & e, const std::string & imagePath, const std::string & prompt, int maxTokens) {
    auto started = Clock::now();
    e.check();
    if (!e.model || !e.vision) throw std::runtime_error("analysis_model_load_failed");
    auto contextParams = llama_context_default_params();
    contextParams.n_ctx = 2048;
    contextParams.n_batch = e.memoryConstrained ? 256 : 512;
    contextParams.n_ubatch = e.memoryConstrained ? 64 : 128;
    contextParams.n_threads = threadCount();
    contextParams.n_threads_batch = threadCount();
    contextParams.offload_kqv = e.gpu != nullptr;
    contextParams.op_offload = e.gpu != nullptr;
    contextParams.abort_callback = abortDecode;
    contextParams.abort_callback_data = &e;
    if (e.memoryConstrained) {
        contextParams.cb_eval = checkGraph;
        contextParams.cb_eval_user_data = &e;
    }
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
    auto encodedImages = e.memoryConstrained ? encodeImages(e, chunks.get()) : std::vector<EncodedImage>{};
    e.check();
    prepareLanguageGpu(e);
    contextParams.offload_kqv = e.gpu != nullptr;
    contextParams.op_offload = e.gpu != nullptr;
    const auto contextStarted = Clock::now();
    std::unique_ptr<llama_context, decltype(&llama_free)> context(llama_init_from_model(e.model, contextParams), llama_free);
    if (!context) throw std::runtime_error("analysis_out_of_memory");
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s context_ms=%lld", backendName(e), elapsed(contextStarted));
    llama_pos nPast = 0;
    e.check();
    int status = 0;
    if (e.memoryConstrained) {
        for (size_t i = 0; i < encodedImages.size(); ++i) {
            e.check();
            auto & encoded = encodedImages[i];
            // The pinned text helper never accesses the vision context.
            status = encoded.embeddings.empty()
                ? mtmd_helper_eval_chunk_single(nullptr, context.get(), mtmd_input_chunks_get(chunks.get(), i),
                    nPast, 0, contextParams.n_batch, i + 1 == encodedImages.size(), &nPast)
                : decodeImage(context.get(), encoded, contextParams.n_batch, nPast);
            if (status != 0) break;
        }
        encodedImages.clear();
    } else {
        status = mtmd_helper_eval_chunks(e.vision, context.get(), chunks.get(), 0, 0, contextParams.n_batch, true, &nPast);
    }
    chunks.reset();
    e.check();
    if (status != 0) throw std::runtime_error("analysis_image_eval_failed");
    auto prefillMs = elapsed(started);
    __android_log_print(ANDROID_LOG_INFO, "ChromaAnalysis", "backend=%s prefill_ms=%lld input_tokens=%d", backendName(e), prefillMs, nPast);

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
                        backendName(e), prefillMs, elapsed(started) - prefillMs,
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
            if ((!e.gpu && !e.visionGpu) || e.cancelled.load() ||
                (!chroma::retryOnCpu(error.what()) && dynamic_cast<const std::bad_alloc *>(&error) == nullptr)) throw;
            e.gpuRejected = true;
            e.unload();
            __android_log_print(ANDROID_LOG_WARN, "ChromaAnalysis", "backend=cpu fallback=gpu_generate_failed");
            prepare(e, e.modelPath, e.visionPath);
            output = generate(e, imagePath, prompt, maxTokens);
        }
        if (e.memoryConstrained) e.unload();
        auto result = env->NewByteArray(static_cast<jsize>(output.size()));
        if (result) env->SetByteArrayRegion(result, 0, static_cast<jsize>(output.size()), reinterpret_cast<const jbyte *>(output.data()));
        return result;
    } catch (...) { rejectCurrent(env); return nullptr; }
}
extern "C" JNIEXPORT void JNICALL
Java_com_cheng80_chromaanalysis_AnalysisEngine_nativeDestroy(JNIEnv *, jobject, jlong handle) {
    delete reinterpret_cast<Engine *>(handle);
}
