#!/usr/bin/env python3
"""Prepare the manifest-pinned llama.cpp sources used by the Android NDK build."""
import json
import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules/chroma-analysis"
TARGET = MODULE / ".model-cache/llama.cpp"
LOCAL = ROOT / "experiments/model-selection/data/ios-smoke/vendor/llama.cpp"
VULKAN = MODULE / ".model-cache/android-vulkan"
HEADER_TAG = "vulkan-sdk-1.4.328.1"
HEADER_PINS = {
    "Vulkan-Headers": "19725e4d48082fe78e26622b15d3080ccd54112b",
    "SPIRV-Headers": "01e0577914a75a2569c846778c2f93aa8e6feddd",
}


def prepare_vulkan(args):
    sdk = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or
               Path.home() / "Library/Android/sdk")
    # Reuse a host compiler from PATH/the existing NDK. No full Vulkan SDK install.
    glslc = args.glslc or shutil.which("glslc")
    if not glslc:
        candidates = sorted(sdk.glob("ndk/*/shader-tools/*/glslc"), reverse=True)
        glslc = str(candidates[0]) if candidates else None
    cmake = args.cmake or shutil.which("cmake")
    if not cmake:
        candidate = sdk / "cmake/3.22.1/bin/cmake"
        cmake = str(candidate) if candidate.is_file() else None
    if not glslc or not cmake:
        raise SystemExit("Vulkan build needs host glslc and CMake. Supply --glslc and --cmake; an installed Android NDK includes glslc.")
    subprocess.run([glslc, "--version"], check=True)
    with tempfile.TemporaryDirectory(prefix="chroma-vulkan-probe-") as temporary:
        subprocess.run([glslc, "-fshader-stage=compute", "--target-env=vulkan1.2",
                        "-DFLOAT_TYPE=float", "-DFLOAT_TYPEV2=vec2", "-DDATA_A_Q4_K=1",
                        "-DB_TYPE=float", "-DB_TYPEV2=vec2", "-DB_TYPEV4=vec4", "-DD_TYPE=float",
                        str(TARGET / "ggml/src/ggml-vulkan/vulkan-shaders/mul_mat_vec_q4_k.comp"),
                        "-o", str(Path(temporary) / "probe.spv")], check=True)
    for name, pin in HEADER_PINS.items():
        target = VULKAN / name
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "clone", "--depth", "1", "--branch", HEADER_TAG,
                            f"https://github.com/KhronosGroup/{name}.git", str(target)], check=True)
        actual = subprocess.check_output(["git", "-C", str(target), "rev-parse", "HEAD"], text=True).strip()
        dirty = subprocess.check_output(["git", "-C", str(target), "status", "--porcelain", "--untracked-files=no"], text=True).strip()
        if actual != pin or dirty:
            raise SystemExit(f"{name} differs from the verified pin; preserve local edits and prepare a clean checkout.")
    # Header-only install creates the official find_package config, without a host
    # Vulkan loader, drivers, emulator changes, or changes to the llama.cpp checkout.
    prefix = VULKAN / "install"
    subprocess.run([cmake, "-S", str(VULKAN / "SPIRV-Headers"), "-B", str(VULKAN / "headers-build"),
                    f"-DCMAKE_INSTALL_PREFIX={prefix}", "-DSPIRV_HEADERS_ENABLE_TESTS=OFF"], check=True)
    subprocess.run([cmake, "--install", str(VULKAN / "headers-build")], check=True, stdout=subprocess.DEVNULL)
    configs = list(prefix.rglob("SPIRV-HeadersConfig.cmake"))
    if len(configs) != 1:
        raise SystemExit("SPIRV-Headers package config was not installed.")
    values = {
        "Vulkan_GLSLC_EXECUTABLE": str(Path(glslc).resolve()),
        "Vulkan_INCLUDE_DIR": str(VULKAN / "Vulkan-Headers/include"),
        "SPIRV-Headers_DIR": str(configs[0].parent),
        "CHROMA_SPIRV_INCLUDE": str(prefix / "include"),
    }
    def quote(value):
        return '"' + value.replace('\\', '/').replace('"', '\\"').replace('$', '\\$') + '"'
    (VULKAN / "toolchain.cmake").write_text("\n".join(
        f"set({key} {quote(value)} CACHE STRING \"\" FORCE)" for key, value in values.items()) + "\n")
    print("Prepared pinned Vulkan/SPIR-V headers and existing host glslc; native compilation remains a separate build step.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glslc", help="Existing host glslc executable; defaults to PATH or installed Android NDK")
    parser.add_argument("--cmake", help="Existing host CMake executable")
    args = parser.parse_args()
    revision = json.loads((MODULE / "model-manifest.json").read_text())["runtime_revision"]
    if not TARGET.exists():
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        source = str(LOCAL) if (LOCAL / ".git").is_dir() else "https://github.com/ggml-org/llama.cpp.git"
        subprocess.run(["git", "clone", "--no-checkout", source, str(TARGET)], check=True)
        subprocess.run(["git", "-C", str(TARGET), "checkout", "--detach", revision], check=True)
    actual = subprocess.check_output(["git", "-C", str(TARGET), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(TARGET), "status", "--porcelain", "--untracked-files=no"], text=True).strip()
    if actual != revision or dirty:
        raise SystemExit("Android llama.cpp source differs from the manifest pin; preserve local edits and prepare a clean pinned checkout.")
    print(f"Prepared Android llama.cpp {revision}; GGUF weights remain downloadable assets.")
    prepare_vulkan(args)


if __name__ == "__main__":
    main()
