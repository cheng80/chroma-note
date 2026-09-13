#pragma once
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <string>

namespace chroma {
inline uint64_t gpuWeightBudget(uint64_t totalMemory) {
    // GPU weights must stay resident; leave room for Android, the app, and
    // inference buffers. CPU mmap can instead reclaim clean weight pages.
    constexpr uint64_t reserve = 2ULL * 1024 * 1024 * 1024;
    return totalMemory > reserve ? totalMemory - reserve : 0;
}

inline bool fitsGpuMemory(uint64_t totalMemory, uint64_t weightBytes) {
    return weightBytes > 0 && weightBytes <= gpuWeightBudget(totalMemory);
}

inline bool stageModels(uint64_t totalMemory, uint64_t weightBytes) {
    return totalMemory < 6ULL * 1024 * 1024 * 1024 || !fitsGpuMemory(totalMemory, weightBytes);
}

inline bool preferCpu(std::string description) {
    std::transform(description.begin(), description.end(), description.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    // Mali-G57 MC2 vision and full 2B language Vulkan both exceeded 90s in
    // physical tests. Keep this performance exception to the measured GPU family.
    return description.find("mali-g57") != std::string::npos;
}

inline int languageGpuLayers(uint64_t totalMemory, uint64_t weightBytes, int layers) {
    if (weightBytes == 0 || layers <= 0) return 0;
    const auto budget = gpuWeightBudget(totalMemory);
    if (weightBytes <= budget) return layers + 1; // Include the output layer.
    // Partial offload also needs an active CPU weight window. Do not consume
    // the entire allowance with unreclaimable GPU weights (A24 LMKD regression).
    return static_cast<int>(static_cast<long double>(budget / 2) / weightBytes * layers);
}

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
