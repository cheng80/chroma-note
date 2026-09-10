"""Run the author's Informative Drawings generator locally, without its training stack."""

import argparse
import hashlib
import importlib.util
import io
import json
import platform
import resource
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageCms, ImageOps


def normalize(image, edge=512):
    image = ImageOps.exif_transpose(image)
    profile = image.info.get("icc_profile")
    if profile:
        image = ImageCms.profileToProfile(
            image, ImageCms.ImageCmsProfile(io.BytesIO(profile)),
            ImageCms.createProfile("sRGB"), outputMode="RGB",
        )
    else:
        image = image.convert("RGB")
    image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    if min(image.size) < 4:
        raise ValueError("Input must be at least four pixels on each axis")
    array = np.array(image, dtype=np.float32) / 255
    height, width = array.shape[:2]
    padded = np.pad(array, ((0, -height % 4), (0, -width % 4), (0, 0)), mode="reflect")
    tensor = torch.from_numpy(padded.copy()).permute(2, 0, 1).unsqueeze(0)
    return image, tensor


def self_test():
    image = Image.new("RGB", (101, 73), "red")
    image.getexif()[274] = 6
    normalized, tensor = normalize(image, 64)
    assert normalized.size == (46, 64), normalized.size
    assert tensor.shape == (1, 3, 64, 48), tensor.shape
    assert tuple(normalized.getpixel((0, 0))) == (255, 0, 0)
    assert tensor[0, 0].min() == 1 and tensor[0, 1:].max() == 0
    print("PASS: EXIF orientation, aspect ratio, reflection padding, RGB range")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--vendor", type=Path)
    parser.add_argument("--weights", default="model.pth", choices=["model.pth", "model2.pth"])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--edge", type=int, default=512)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not all([args.manifest, args.vendor, args.output]) or args.edge < 16:
        parser.error("manifest, vendor, output and edge >= 16 are required")
    if args.output.exists():
        parser.error("output must be new, to preserve previous runs")
    expected = {
        "model.pth": "c686ced2a666b4850b4bb6ccf0748031c3eda9f822de73a34b8979970d90f0c6",
        "model2.pth": "30a534781061f34e83bb9406b4335da4ff2616c95d22a585c1245aa8363e74e0",
    }
    weights = args.vendor / args.weights
    digest = hashlib.sha256(weights.read_bytes()).hexdigest()
    if digest != expected[args.weights]:
        raise ValueError("Author weight SHA-256 mismatch")
    spec = importlib.util.spec_from_file_location("informative_drawings", args.vendor / "model.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    torch.set_num_threads(4)
    torch.manual_seed(0)
    started = time.perf_counter()
    model = module.Generator(3, 1, 3).eval()
    model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True), strict=True)
    report = {
        "weights": args.weights, "sha256": digest, "device": "Mac CPU (not iPhone)",
        "platform": platform.platform(), "torch": torch.__version__, "threads": 4,
        "parameters": sum(p.numel() for p in model.parameters()), "edge": args.edge,
        "model_load_seconds": time.perf_counter() - started,
        "source_code_sha256": hashlib.sha256((args.vendor / "model.py").read_bytes()).hexdigest(),
        "postprocess": "raw sigmoid to 8-bit gray, no threshold/denoise/texture", "images": [],
    }
    args.output.mkdir(parents=True)
    cases = json.loads(args.manifest.read_text())["cases"]
    first = None
    for case in cases:
        started = time.perf_counter()
        with Image.open(args.manifest.parent / case["input"]) as source:
            normalized, tensor = normalize(source, args.edge)
        normalized.save(args.output / (case["id"] + "-input.png"))
        infer_started = time.perf_counter()
        with torch.inference_mode():
            prediction = model(tensor)[0, 0]
        inference_seconds = time.perf_counter() - infer_started
        width, height = normalized.size
        assert tuple(prediction.shape) == tuple(tensor.shape[-2:])
        prediction = prediction[:height, :width]
        assert torch.isfinite(prediction).all() and prediction.min() >= 0 and prediction.max() <= 1
        pixels = (prediction.numpy() * 255).round().astype(np.uint8)
        Image.fromarray(pixels).save(args.output / (case["id"] + ".png"))
        if first is None:
            first = (tensor, pixels)
        item = {
            "id": case["id"], "size": [width, height],
            "inference_seconds": inference_seconds, "total_seconds": time.perf_counter() - started,
            "png_sha256": hashlib.sha256((args.output / (case["id"] + ".png")).read_bytes()).hexdigest(),
        }
        report["images"].append(item)
        print(json.dumps(item), flush=True)
    with torch.inference_mode():
        tensor, previous = first
        height, width = previous.shape
        repeated = (model(tensor)[0, 0, :height, :width].numpy() * 255).round().astype(np.uint8)
    report["repeat_first_image_byte_equal"] = bool(np.array_equal(previous, repeated))
    report["process_peak_rss_bytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    assert report["repeat_first_image_byte_equal"], "Identical CPU input produced different pixels"
    (args.output / "run.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print("PASS: finite outputs, shape preservation, repeat consistency", flush=True)


if __name__ == "__main__":
    main()
