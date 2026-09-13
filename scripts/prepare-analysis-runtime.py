#!/usr/bin/env python3
"""Stage pinned llama.cpp libraries and headers; models download inside the app."""

from __future__ import annotations

import json
import filecmp
import shutil
import subprocess
import tempfile
from argparse import ArgumentParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules/chroma-analysis"
IOS_SMOKE = ROOT / "experiments/model-selection/data/ios-smoke"
LLAMA = IOS_SMOKE / "vendor/llama.cpp"
RUNTIME_REPOSITORY = "https://github.com/ggml-org/llama.cpp.git"
PLATFORMS = {
    "iphonesimulator": "build-ios-sim-cli",
    "iphoneos": "build-ios-device-cli",
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

METAL_LIBRARY = "ggml/src/ggml-metal/libggml-metal.a"

def runtime_headers(source: Path) -> list[Path]:
    return [
        source / "include/llama.h",
        source / "tools/mtmd/mtmd.h",
        source / "tools/mtmd/mtmd-helper.h",
        *sorted((source / "ggml/include").glob("*.h")),
    ]


def verify_runtime_source(source: Path, revision: str) -> None:
    actual = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
    ).strip()
    dirty = subprocess.check_output(
        ["git", "-C", str(source), "status", "--porcelain"], text=True
    ).strip()
    if actual != revision or dirty:
        raise SystemExit("runtime source differs from the manifest pin; preserve local edits and prepare a clean checkout")


def prepare_runtime_source(revision: str, destination: Path = LLAMA,
                           repository: str = RUNTIME_REPOSITORY) -> None:
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".llama-prepare-", dir=destination.parent) as temporary:
            staged = Path(temporary) / "llama.cpp"
            subprocess.run(["git", "init", "--quiet", str(staged)], check=True)
            subprocess.run(["git", "-C", str(staged), "fetch", "--depth", "1", repository, revision], check=True)
            subprocess.run(["git", "-C", str(staged), "checkout", "--quiet", "--detach", "FETCH_HEAD"], check=True)
            verify_runtime_source(staged, revision)
            staged.rename(destination)
    verify_runtime_source(destination, revision)

def checked_copy(source: Path, target: Path) -> None:
    if not source.is_file():
        raise SystemExit(f"missing prepared runtime file: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and filecmp.cmp(source, target, shallow=False):
        return
    shutil.copy2(source, target)

def build_runtime(platform: str, build: Path) -> None:
    subprocess.run([
        "cmake", "-S", str(LLAMA), "-B", str(build), "-G", "Xcode",
        "-DCMAKE_SYSTEM_NAME=iOS", f"-DCMAKE_OSX_SYSROOT={platform}",
        "-DCMAKE_OSX_ARCHITECTURES=arm64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=17.0",
        "-DBUILD_SHARED_LIBS=OFF", "-DGGML_BLAS=ON", "-DGGML_BLAS_VENDOR=Apple",
        f"-DGGML_METAL={'ON' if platform == 'iphoneos' else 'OFF'}",
        "-DGGML_METAL_EMBED_LIBRARY=ON", "-DLLAMA_BUILD_COMMON=ON", "-DLLAMA_BUILD_TOOLS=ON",
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
    if not LLAMA.exists() and not args.build:
        raise SystemExit("runtime cache is missing; rerun with --build to restore the pinned source and libraries")
    prepare_runtime_source(manifest["runtime_revision"])
    resources = MODULE / "ios/Resources"
    resources.mkdir(parents=True, exist_ok=True)
    for name in ("model-manifest.json", "model-download.json"):
        shutil.copy2(MODULE / name, resources / name)
    if args.build:
        build_runtime(platform, build)
    for library in LIBRARIES + ([METAL_LIBRARY] if platform == "iphoneos" else []):
        library_path = Path(library)
        source = build / library_path.parent / f"Release-{platform}" / library_path.name
        checked_copy(source, MODULE / "ios/Libraries" / platform / "lib" / source.name)
    for source in runtime_headers(LLAMA):
        checked_copy(source, MODULE / "ios/Libraries/include" / source.name)
    print(f"Prepared pinned llama.cpp {platform} libraries and headers. Models download in the app.")

if __name__ == "__main__":
    main()
