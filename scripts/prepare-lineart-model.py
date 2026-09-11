#!/usr/bin/env python3
"""Prepare the pinned Informative Drawings style-1 Core ML model locally.

Install the exact isolated runtime first:
  experiments/model-selection/.venv/bin/pip install -r modules/chroma-lineart/requirements-prepare.txt

This script downloads only the pinned public author files, verifies SHA-256,
exports the generator with bounded dynamic NCHW input, checks Core ML against
PyTorch locally, and compiles the result for the module Pod. It never uploads
photos. New artifacts are validated in a temporary directory and atomically
replace only this script's package and module resource after success.
"""

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path

import coremltools as ct
import numpy as np
import torch
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "modules/chroma-lineart/.model-cache"
VENDOR = CACHE / "vendor"
PACKAGE = CACHE / "build/LineArt.mlpackage"
COMPILED = ROOT / "modules/chroma-lineart/ios/Resources/LineArt.mlmodelc"
MANIFEST = ROOT / "modules/chroma-lineart/model-manifest.json"
DEFAULT_PHOTO = ROOT / "design/images/generated-1788887279815.png"

CODE = {
    "url": "https://raw.githubusercontent.com/carolineec/informative-drawings/2349aee4daf7cb01d8de645b0bbb4f4392fd1395/model.py",
    "sha256": "b5767c84166752f5f6185d4a65b3be3c1524bfaf0c524172b7636afe1a42e4f3",
}
WEIGHTS = {
    "url": "https://huggingface.co/spaces/carolineec/informativedrawings/resolve/bd4b4299be505803e036203a39c02024b4cfee11/model.pth",
    "revision": "bd4b4299be505803e036203a39c02024b4cfee11",
    "sha256": "c686ced2a666b4850b4bb6ccf0748031c3eda9f822de73a34b8979970d90f0c6",
    "bytes": 17173511,
}
MIN_DIM, MAX_DIM, DEFAULT_DIM = 16, 1536, 1024
DOWNLOAD_TIMEOUT_SECONDS = 30


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tree_sha256(path):
    files = {str(file.relative_to(path)): sha256(file) for file in sorted(path.rglob("*")) if file.is_file()}
    digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return digest, files


def download_pinned(url, destination, expected_sha256):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and sha256(destination) == expected_sha256:
        return
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
                shutil.copyfileobj(response, temporary)
        actual = sha256(temporary_path)
        if actual != expected_sha256:
            raise ValueError(f"SHA-256 mismatch for {destination.name}: {actual}")
        temporary_path.replace(destination)
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)


def load_generator():
    spec = importlib.util.spec_from_file_location("informative_drawings", VENDOR / "model.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    torch.set_num_threads(4)
    torch.manual_seed(0)
    model = module.Generator(3, 1, 3).eval()
    model.load_state_dict(torch.load(VENDOR / "model.pth", map_location="cpu", weights_only=True), strict=True)
    return model


def padded_tensor(pixels):
    height, width = pixels.shape[:2]
    padded = np.pad(pixels, ((0, -height % 4), (0, -width % 4), (0, 0)), mode="reflect")
    assert MIN_DIM <= padded.shape[0] <= MAX_DIM and MIN_DIM <= padded.shape[1] <= MAX_DIM
    assert padded.shape[0] % 4 == 0 and padded.shape[1] % 4 == 0
    return torch.from_numpy(padded.copy()).permute(2, 0, 1).unsqueeze(0)


def synthetic_pixels(width, height):
    y, x = np.indices((height, width), dtype=np.uint32)
    return np.stack(((x * 17 + y * 3) % 256, (x * 5 + y * 29) % 256, (x * 31 + y * 11) % 256), axis=-1).astype(np.float32) / 255


def photo_tensor(path):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((MAX_DIM, MAX_DIM), Image.Resampling.LANCZOS)
        return padded_tensor(np.asarray(image, dtype=np.float32) / 255), image.size


def reference_identity(path):
    try:
        return {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
    except ValueError:
        return {"path": "<external-local-reference>", "sha256": sha256(path)}


def validate(model, converted, photo_path):
    cases = [
        ("synthetic_minimum_16x16", padded_tensor(synthetic_pixels(16, 16)), [16, 16]),
        ("synthetic_max_width_1536", padded_tensor(synthetic_pixels(1536, 16)), [1536, 16]),
        ("synthetic_max_height_1536", padded_tensor(synthetic_pixels(16, 1536)), [16, 1536]),
        ("synthetic_portrait_odd", padded_tensor(synthetic_pixels(101, 151)), [101, 151]),
        ("synthetic_landscape_odd", padded_tensor(synthetic_pixels(151, 101)), [151, 101]),
        ("synthetic_square_odd", padded_tensor(synthetic_pixels(257, 257)), [257, 257]),
        ("synthetic_portrait", padded_tensor(synthetic_pixels(509, 1021)), [509, 1021]),
        ("synthetic_landscape", padded_tensor(synthetic_pixels(1021, 509)), [1021, 509]),
    ]
    photo, photo_size = photo_tensor(photo_path)
    cases.append(("local_reference_image", photo, list(photo_size)))
    report = []
    for name, tensor, source_size in cases:
        input_array = tensor.numpy()
        with torch.inference_mode():
            reference = model(tensor).numpy()
        actual = converted.predict({"image": input_array})["line"]
        repeated = converted.predict({"image": input_array})["line"]
        if actual.shape != reference.shape or not np.isfinite(actual).all():
            raise AssertionError(f"{name}: Core ML output shape or finiteness changed")
        if actual.min() < 0 or actual.max() > 1:
            raise AssertionError(f"{name}: Core ML output is outside [0, 1]")
        delta = np.abs(actual - reference)
        row = {
            "id": name,
            "source_size_wh": source_size,
            "padded_nchw": list(input_array.shape),
            "mae": float(delta.mean()),
            "p99_error": float(np.quantile(delta, 0.99)),
            "coreml_repeat_byte_equal": bool(np.array_equal(actual, repeated)),
        }
        if row["mae"] >= 0.01 or row["p99_error"] >= 0.05 or not row["coreml_repeat_byte_equal"]:
            raise AssertionError(f"{name}: parity threshold or repeat check failed: {row}")
        report.append(row)
        print(json.dumps(row), flush=True)
    return report


def replace_directories(staged_destinations):
    """Commit both script-owned artifacts together, restoring both on swap failure."""
    backups = {}
    committed = []
    try:
        for _, destination in staged_destinations:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                backup = destination.with_name(f".{destination.name}.previous-{uuid.uuid4().hex}")
                os.replace(destination, backup)
                backups[destination] = backup
        for staged, destination in staged_destinations:
            os.replace(staged, destination)
            committed.append(destination)
    except BaseException:
        for destination in reversed(committed):
            shutil.rmtree(destination)
        for destination, backup in backups.items():
            if backup.exists():
                os.replace(backup, destination)
        raise
    else:
        for backup in backups.values():
            shutil.rmtree(backup)


def write_manifest(package_tree, compiled_tree, validation, reference):
    dependencies = {name: importlib.metadata.version(name) for name in ("coremltools", "torch", "numpy", "pillow")}
    manifest = {
        "format": 1,
        "model": {"name": "Informative Drawings style 1", "generator": "Generator(3, 1, 3)"},
        "source": {
            "author_code": {**CODE, "revision": "2349aee4daf7cb01d8de645b0bbb4f4392fd1395"},
            "author_weights": WEIGHTS,
        },
        "conversion": {
            "format": "mlprogram",
            "minimum_deployment_target": "iOS 17",
            "compute_precision": "float16",
            "input": {"name": "image", "dtype": "float32", "layout": "NCHW", "shape": [1, 3, {"range": [16, 1536], "default": 1024}, {"range": [16, 1536], "default": 1024}]},
            "output": {"name": "line", "dtype": "float32", "shape": "1x1xHxW"},
            "runtime_input_rule": "Pad H and W with reflection to multiples of 4 before inference; only padded dimensions within 16...1536 are accepted.",
            "forced_square": False,
        },
        "prepared_with": {
            "command": "experiments/model-selection/.venv/bin/python scripts/prepare-lineart-model.py [--photo PATH]",
            "dependencies": dependencies,
            "package_sha256_tree": package_tree[0],
            "package_files_sha256": package_tree[1],
            "compiled_path": "modules/chroma-lineart/ios/Resources/LineArt.mlmodelc",
            "compiled_sha256_tree": compiled_tree[0],
            "compiled_files_sha256": compiled_tree[1],
            "compiler": "xcrun coremlcompiler compile --platform iOS --deployment-target 17.0",
        },
        "validation": {
            "local_only": True,
            "photos_uploaded": False,
            "reference": "PyTorch CPU versus Core ML on deterministic synthetic inputs and a local reference image; no image is uploaded.",
            "reference_image": reference,
            "thresholds": {"mae_lt": 0.01, "p99_error_lt": 0.05, "finite_range": "[0, 1]", "repeat": "byte equal"},
            "cases": validation,
            "phone_performance_claim": "None. This preparation run does not measure a phone.",
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photo", type=Path, default=DEFAULT_PHOTO, help="Optional local reference image; never uploaded.")
    args = parser.parse_args()
    photo_path = args.photo.resolve()
    if not photo_path.is_file():
        parser.error(f"Reference image is absent: {photo_path}")
    reference = reference_identity(photo_path)
    download_pinned(CODE["url"], VENDOR / "model.py", CODE["sha256"])
    download_pinned(WEIGHTS["url"], VENDOR / "model.pth", WEIGHTS["sha256"])
    if (VENDOR / "model.pth").stat().st_size != WEIGHTS["bytes"]:
        raise ValueError("model.pth size mismatch")
    model = load_generator()
    with torch.inference_mode():
        traced = torch.jit.trace(model, torch.rand(1, 3, 64, 64))
    CACHE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=CACHE, prefix=".prepare-") as temporary:
        staged = Path(temporary)
        staged_package = staged / "LineArt.mlpackage"
        converted = ct.convert(
            traced,
            inputs=[ct.TensorType(name="image", dtype=np.float32, shape=ct.Shape(shape=(1, 3, ct.RangeDim(MIN_DIM, MAX_DIM, DEFAULT_DIM), ct.RangeDim(MIN_DIM, MAX_DIM, DEFAULT_DIM))) )],
            outputs=[ct.TensorType(name="line", dtype=np.float32)],
            convert_to="mlprogram",
            minimum_deployment_target=ct.target.iOS17,
            compute_precision=ct.precision.FLOAT16,
            skip_model_load=True,
        )
        converted.save(str(staged_package))
        mobile = ct.models.MLModel(str(staged_package), compute_units=ct.ComputeUnit.ALL)
        validation = validate(model, mobile, photo_path)
        compiled_parent = staged / "compiled"
        subprocess.run(["xcrun", "coremlcompiler", "compile", str(staged_package), str(compiled_parent), "--platform", "iOS", "--deployment-target", "17.0"], check=True)
        staged_compiled = compiled_parent / "LineArt.mlmodelc"
        if not staged_compiled.is_dir():
            raise FileNotFoundError(f"Compiler did not create {staged_compiled}")
        package_tree, compiled_tree = tree_sha256(staged_package), tree_sha256(staged_compiled)
        replace_directories(((staged_package, PACKAGE), (staged_compiled, COMPILED)))
    write_manifest(package_tree, compiled_tree, validation, reference)
    print("PASS: pinned source, FP16 iOS 17 export, local parity, and iOS compilation", flush=True)


if __name__ == "__main__":
    main()
