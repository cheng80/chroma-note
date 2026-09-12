#!/usr/bin/env python3
"""Verify and stage the already-tested local Qwen/llama.cpp iOS Simulator runtime."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from argparse import ArgumentParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules/chroma-analysis"
IOS_SMOKE = ROOT / "experiments/model-selection/data/ios-smoke"
LLAMA = IOS_SMOKE / "vendor/llama.cpp"
PLATFORMS = {
    "iphonesimulator": "build-ios-sim-cli",
    "iphoneos": "build-ios-device-cli",
}

FILES = {
    IOS_SMOKE / "qwen3vl-compat/qwen3vl-4b-ollama-compatible.gguf": (
        MODULE / "ios/Resources/Qwen3VL-4B-Instruct-Q4_K_M-compatible.gguf",
        2496537376, "e92ef378e04d6519cb1f0274e7d5bd7d902efe572edaa24d96193a9e10bd8f09"),
    IOS_SMOKE / "models/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf": (
        MODULE / "ios/Resources/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf",
        453974304, "30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d"),
}

LIBRARIES = [
    "tools/mtmd/libmtmd.a",
    "src/libllama.a",
    "ggml/src/libggml.a",
    "ggml/src/libggml-base.a",
    "ggml/src/libggml-cpu.a",
    "ggml/src/ggml-blas/libggml-blas.a",
    "vendor/hash/libvendor-hash.a",
]

HEADERS = [
    LLAMA / "include/llama.h",
    LLAMA / "tools/mtmd/mtmd.h",
    LLAMA / "tools/mtmd/mtmd-helper.h",
    *sorted((LLAMA / "ggml/include").glob("*.h")),
]

def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()

def checked_copy(source: Path, target: Path, size: int | None = None, sha256: str | None = None) -> None:
    if not source.is_file():
        raise SystemExit(f"missing prepared runtime file: {source}")
    if size is not None and source.stat().st_size != size:
        raise SystemExit(f"unexpected byte size: {source}")
    if sha256 is not None and digest(source) != sha256:
        raise SystemExit(f"sha256 mismatch: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size == source.stat().st_size:
        if sha256 is None or digest(target) == sha256:
            return
    shutil.copy2(source, target)

def build_runtime(platform: str, build: Path) -> None:
    subprocess.run([
        "cmake", "-S", str(LLAMA), "-B", str(build), "-G", "Xcode",
        "-DCMAKE_SYSTEM_NAME=iOS", f"-DCMAKE_OSX_SYSROOT={platform}",
        "-DCMAKE_OSX_ARCHITECTURES=arm64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=17.0",
        "-DBUILD_SHARED_LIBS=OFF", "-DGGML_BLAS=ON", "-DGGML_BLAS_VENDOR=Apple",
        "-DGGML_METAL=OFF", "-DLLAMA_BUILD_COMMON=ON", "-DLLAMA_BUILD_TOOLS=ON",
        "-DLLAMA_BUILD_EXAMPLES=OFF", "-DLLAMA_BUILD_SERVER=OFF", "-DLLAMA_BUILD_TESTS=OFF",
        "-DLLAMA_BUILD_UI=OFF", "-DLLAMA_BUILD_APP=OFF",
    ], check=True)
    subprocess.run([
        "cmake", "--build", str(build), "--config", "Release", "--target", "llama", "mtmd",
        "--", "CODE_SIGNING_ALLOWED=NO",
    ], check=True)

def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--platform", choices=PLATFORMS, default="iphonesimulator")
    parser.add_argument("--build", action="store_true")
    args = parser.parse_args()
    platform = args.platform
    build = IOS_SMOKE / PLATFORMS[platform]
    manifest = json.loads((MODULE / "model-manifest.json").read_text())
    revision = subprocess.run(
        ["git", "-C", str(LLAMA), "rev-parse", "HEAD"], check=True, capture_output=True, text=True
    ).stdout.strip()
    if manifest["runtime_revision"] != revision:
        raise SystemExit("runtime revision is not pinned")
    if args.build:
        build_runtime(platform, build)
    for source, (target, size, sha256) in FILES.items():
        checked_copy(source, target, size, sha256)
    for library in LIBRARIES:
        library_path = Path(library)
        source = build / library_path.parent / f"Release-{platform}" / library_path.name
        checked_copy(source, MODULE / "ios/Libraries" / platform / "lib" / source.name)
    for source in HEADERS:
        checked_copy(source, MODULE / "ios/Libraries/include" / source.name)
    print(f"Prepared verified Qwen3-VL + llama.cpp {platform} runtime.")

if __name__ == "__main__":
    main()
