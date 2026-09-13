#!/usr/bin/env python3
"""Export the pinned style1 weights to Android ONNX, then verify before publishing.

Use experiments/model-selection/.venv, with the existing iOS preparation packages
plus onnx==1.20.1 and onnxruntime==1.24.3. No iOS artifact is modified.
"""

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "modules/chroma-lineart/android"
CACHE = ANDROID / "build/model-cache"
ASSET = ANDROID / "src/main/assets/chroma-lineart/LineArt.onnx"
MANIFEST = ANDROID / "model-manifest.json"
SOURCE = json.loads((ROOT / "modules/chroma-lineart/model-manifest.json").read_text())["source"]


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def pinned_file(name, metadata):
    cached = ROOT / "modules/chroma-lineart/.model-cache/vendor" / name
    if cached.is_file() and sha256(cached) == metadata["sha256"]:
        return cached
    cached = CACHE / "vendor" / name
    cached.parent.mkdir(parents=True, exist_ok=True)
    if not cached.is_file() or sha256(cached) != metadata["sha256"]:
        with urllib.request.urlopen(metadata["url"], timeout=30) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != metadata["sha256"]:
            raise ValueError(f"Pinned source hash mismatch: {name}")
        cached.write_bytes(data)
    return cached


def generator():
    code = pinned_file("model.py", SOURCE["author_code"])
    weights = pinned_file("model.pth", SOURCE["author_weights"])
    spec = importlib.util.spec_from_file_location("informative_drawings_android", code)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = module.Generator(3, 1, 3).eval()
    model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True), strict=True)
    return model


def tensor(pixels):
    h, w = pixels.shape[:2]
    padded = np.pad(pixels, ((0, -h % 4), (0, -w % 4), (0, 0)), mode="reflect")
    return np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32) / 255


def colorize(line, pixels, gain):
    h, w = pixels.shape[:2]
    gray = np.rint(line[0, 0, :h, :w] * np.float32(255)).astype(np.int32)
    alpha = np.minimum(255, np.rint((255 - gray).astype(np.float64) * gain)).astype(np.int32)[..., None]
    return ((pixels.astype(np.int32) * alpha + 255 * (255 - alpha) + 127) // 255).astype(np.uint8)


def validate(model, path, photo):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    sizes = [(16, 16), (1536, 16), (16, 1536), (101, 151), (151, 101), (257, 257), (509, 1021), (1021, 509)]
    cases = []
    for w, h in sizes:
        y, x = np.indices((h, w), dtype=np.uint32)
        pixels = np.stack(((x * 17 + y * 3) % 256, (x * 5 + y * 29) % 256, (x * 31 + y * 11) % 256), axis=-1).astype(np.uint8)
        cases.append((f"synthetic_{w}x{h}", pixels))
    with Image.open(photo) as original:
        image = ImageOps.exif_transpose(original).convert("RGBA")
        image.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
        white = Image.new("RGBA", image.size, "white")
        white.alpha_composite(image)
        cases.append(("local_reference_image", np.asarray(white.convert("RGB"))))
    report = []
    for name, pixels in cases:
        inputs = tensor(pixels)
        with torch.inference_mode():
            reference = model(torch.from_numpy(inputs)).numpy()
        actual = session.run(["line"], {"image": inputs})[0]
        repeat = session.run(["line"], {"image": inputs})[0]
        assert actual.shape == reference.shape and np.isfinite(actual).all(), name
        assert actual.min() >= 0 and actual.max() <= 1, name
        delta = np.abs(actual - reference)
        row = {"id": name, "padded_nchw": list(inputs.shape), "mae": float(delta.mean()),
               "p99_error": float(np.quantile(delta, .99)), "max_error": float(delta.max()),
               "repeat_byte_equal": bool(np.array_equal(actual, repeat))}
        # Same acceptance limits as the accepted iOS export, plus final RGB error.
        assert row["mae"] < .01 and row["p99_error"] < .05 and row["repeat_byte_equal"], row
        row["rgb"] = []
        for gain in (.1, 1., 1.8, 4.):
            error = np.abs(colorize(actual, pixels, gain).astype(np.int16) - colorize(reference, pixels, gain).astype(np.int16))
            rgb = {"gain": gain, "mae_byte": float(error.mean()), "p99_error_byte": float(np.quantile(error, .99)), "max_error_byte": int(error.max())}
            assert rgb["mae_byte"] < 1 and rgb["p99_error_byte"] <= 3, rgb
            row["rgb"].append(rgb)
        report.append(row)
        print(json.dumps(row), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photo", type=Path, default=ROOT / "design/images/generated-1788887279815.png")
    args = parser.parse_args()
    for package, version in {"onnx": "1.20.1", "onnxruntime": "1.24.3", "torch": "2.14.0"}.items():
        if importlib.metadata.version(package) != version:
            raise RuntimeError(f"Reproducible export requires {package}=={version}")
    torch.set_num_threads(2)
    torch.manual_seed(0)
    model = generator()
    CACHE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=CACHE, prefix="export-") as temporary:
        fp32 = Path(temporary) / "fp32.onnx"
        exported = Path(temporary) / "LineArt.onnx"
        torch.onnx.export(model, torch.rand(1, 3, 64, 64), str(fp32), input_names=["image"], output_names=["line"],
                          dynamic_axes={"image": {2: "height", 3: "width"}, "line": {2: "height", 3: "width"}},
                          opset_version=17, dynamo=False)
        graph = onnx.load(fp32)
        casts = []
        stored_bytes = 0
        for initializer in graph.graph.initializer:
            if initializer.data_type != onnx.TensorProto.FLOAT:
                continue
            name = initializer.name
            values = onnx.numpy_helper.to_array(initializer).astype(np.float16)
            assert np.isfinite(values).all(), name
            initializer.CopyFrom(onnx.numpy_helper.from_array(values, name + "_fp16"))
            casts.append(onnx.helper.make_node("Cast", [initializer.name], [name], name=name + "_to_float", to=onnx.TensorProto.FLOAT))
            stored_bytes += values.nbytes
        nodes = list(graph.graph.node)
        del graph.graph.node[:]
        graph.graph.node.extend(casts + nodes)
        onnx.checker.check_model(graph, full_check=True)
        onnx.save(graph, exported)
        assert exported.stat().st_size < 8_800_000, "8.6 MB model storage budget exceeded"
        validation = validate(model, exported, args.photo)
        manifest = {"format": 1, "source": SOURCE, "model": "Informative Drawings style 1, Generator(3, 1, 3)",
                    "onnx_opset": 17, "storage": "float16 initializers + Cast to float32; float32 operations and I/O",
                    "input": "image: float32 NCHW 1x3xHxW, reflection pad bottom/right to multiples of 4, 16...1536",
                    "output": "line: float32 1x1xHxW, [0,1]", "runtime": "onnxruntime-android:1.24.3 CPU",
                    "bytes": exported.stat().st_size, "weight_bytes": stored_bytes, "sha256": sha256(exported),
                    "dependencies": {p: importlib.metadata.version(p) for p in ("torch", "torchvision", "numpy", "pillow", "onnx", "onnxruntime")},
                    "reference_image_sha256": sha256(args.photo), "validation": validation,
                    "validation_scope": "Local PyTorch CPU vs ONNX Runtime CPU. Android device performance and decoder parity are separate."}
        ASSET.parent.mkdir(parents=True, exist_ok=True)
        os.replace(exported, ASSET)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"PASS: {ASSET.stat().st_size:,} bytes; {manifest['sha256']}", flush=True)


if __name__ == "__main__":
    main()
