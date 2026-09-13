// c++ -std=c++17 gpu-policy-test.cpp -o /tmp/chroma-gpu-policy && /tmp/chroma-gpu-policy
#include "../../android/src/main/cpp/gpu-policy.h"
#include <cassert>

int main() {
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
