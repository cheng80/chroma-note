#pragma once
#include <algorithm>
#include <cctype>
#include <string>

namespace chroma {
inline bool hardwareVulkan(const std::string & backend, std::string description, bool gpu) {
    if (!gpu || backend != "Vulkan" || description.empty()) return false;
    std::transform(description.begin(), description.end(), description.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    for (const char * software : {"llvmpipe", "lavapipe", "swiftshader", "software", "softpipe"}) {
        if (description.find(software) != std::string::npos) return false;
    }
    return true;
}

inline bool retryOnCpu(const std::string & error) {
    return error == "analysis_model_load_failed" || error == "analysis_vision_load_failed" ||
           error == "analysis_out_of_memory" || error == "analysis_image_eval_failed" ||
           error == "analysis_decode_failed";
}
}
