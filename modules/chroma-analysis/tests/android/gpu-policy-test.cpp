// c++ -std=c++17 gpu-policy-test.cpp -o /tmp/chroma-gpu-policy && /tmp/chroma-gpu-policy
#include "../../android/src/main/cpp/gpu-policy.h"
#include <cassert>

int main() {
    constexpr uint64_t GiB = 1024ULL * 1024 * 1024;
    assert(!chroma::fitsGpuMemory(0, 3 * GiB));
    assert(!chroma::fitsGpuMemory(8 * GiB, 0));
    assert(!chroma::fitsGpuMemory(2 * GiB, 3 * GiB));
    assert(!chroma::fitsGpuMemory(4 * GiB, 3 * GiB));
    assert(!chroma::fitsGpuMemory(5 * GiB - 1, 3 * GiB));
    assert(chroma::fitsGpuMemory(5 * GiB, 3 * GiB));
    assert(chroma::fitsGpuMemory(8 * GiB, 3 * GiB));
    assert(chroma::languageGpuLayers(0, 3 * GiB, 36) == 0);
    assert(chroma::languageGpuLayers(2 * GiB, 3 * GiB, 36) == 0);
    assert(chroma::languageGpuLayers(4 * GiB, 0, 36) == 0);
    assert(chroma::languageGpuLayers(4 * GiB, 3 * GiB, 0) == 0);
    assert(chroma::languageGpuLayers(4 * GiB, 3 * GiB, 36) == 12);
    assert(chroma::languageGpuLayers(8 * GiB, 3 * GiB, 36) == 37);
    assert(chroma::languageGpuLayers(4 * GiB, GiB, 28) == 29);
    assert(chroma::stageModels(4 * GiB, GiB));
    assert(!chroma::stageModels(6 * GiB, 3 * GiB));
    assert(chroma::stageModels(8 * GiB, 7 * GiB));
    assert(chroma::preferCpu("Mali-G57 MC2"));
    assert(!chroma::preferCpu("Mali-G715"));
    assert(!chroma::preferCpu("Adreno (TM) 750"));
    assert(chroma::hardwareVulkan("Vulkan", "Adreno (TM) 750", true));
    assert(chroma::hardwareVulkan("Vulkan", "Mali-G715", true));
    for (const char * name : {"llvmpipe (LLVM 21.1.4)", "Lavapipe", "Google SwiftShader", "Software GPU", "softpipe", ""}) {
        assert(!chroma::hardwareVulkan("Vulkan", name, true));
    }
    assert(!chroma::hardwareVulkan("CPU", "Adreno", true));
    assert(!chroma::hardwareVulkan("Vulkan", "Adreno", false));
    for (const char * error : {"analysis_model_load_failed", "analysis_vision_load_failed", "analysis_out_of_memory", "analysis_image_eval_failed", "analysis_decode_failed"}) {
        assert(chroma::retryOnCpu(error));
    }
    for (const char * error : {"analysis_cancelled", "analysis_invalid_image", "analysis_invalid_request", "analysis_no_valid_output"}) {
        assert(!chroma::retryOnCpu(error));
    }
}
