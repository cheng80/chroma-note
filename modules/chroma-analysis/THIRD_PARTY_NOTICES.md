# Third-party notices

- Qwen3-VL 4B Instruct: Qwen team, Apache License 2.0. Model: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct
- llama.cpp: ggml-org contributors, MIT License. Runtime revision: `1945e092030f8668ff93382799502d01490e564d`.

- Vulkan-Headers: Khronos Group, Apache-2.0 or MIT as marked by each file; pinned revision `19725e4d48082fe78e26622b15d3080ccd54112b`.
- SPIRV-Headers: Khronos Group contributors, licenses as marked in the upstream LICENSE/LICENSES files; pinned revision `01e0577914a75a2569c846778c2f93aa8e6feddd`. These headers support the Android Vulkan build; no desktop Vulkan driver is bundled.

The iOS preparation script uses the pinned local artifacts described in `model-manifest.json`. Android `scripts/prepare-analysis-android.py` prepares llama.cpp at the same pinned revision from an existing local Git checkout or the official upstream repository; Gradle builds the JNI runtime from that source. Android uses the same downloadable GGUF weights and does not bundle them. For the separate ChromaLineArt model, see [its notices](../chroma-lineart/THIRD_PARTY_NOTICES.md). Distribution packaging must include the complete upstream license and notice files.
