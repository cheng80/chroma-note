"""Export the pinned style-1 generator; compare the requested image sizes with PyTorch."""

import argparse
import hashlib
import importlib.util
import json
import time
from pathlib import Path

import coremltools as ct
import numpy as np
import torch
from PIL import Image

from colorize_lineart import compose
from run_lineart import normalize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--edge", type=int, choices=[1024, 1536], default=1024)
    parser.add_argument("--reference-device", choices=["cpu", "mps"], default="cpu")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Use a new output directory to preserve prior measurements")
    vendor = args.data / "vendor"
    expected = {
        "model.pth": "c686ced2a666b4850b4bb6ccf0748031c3eda9f822de73a34b8979970d90f0c6",
        "model.py": "b5767c84166752f5f6185d4a65b3be3c1524bfaf0c524172b7636afe1a42e4f3",
    }
    for name, digest in expected.items():
        assert hashlib.sha256((vendor / name).read_bytes()).hexdigest() == digest, name
    spec = importlib.util.spec_from_file_location("author_lineart", vendor / "model.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    torch.set_num_threads(4)
    torch.manual_seed(0)
    model = module.Generator(3, 1, 3).eval()
    model.load_state_dict(torch.load(vendor / "model.pth", map_location="cpu", weights_only=True))
    with torch.inference_mode():
        traced = torch.jit.trace(model, torch.rand(1, 3, 64, 64))
    shapes = [[1, 3, 428, 640], [1, 3, 1024, 832]]
    if args.edge == 1536:
        shapes.append([1, 3, 1536, 1244])
    converted = ct.convert(
        traced, inputs=[ct.TensorType(name="image", dtype=np.float32,
                                     shape=ct.EnumeratedShapes(shapes=shapes, default=shapes[0]))],
        outputs=[ct.TensorType(name="line", dtype=np.float32)],
        convert_to="mlprogram", minimum_deployment_target=ct.target.iOS17,
        compute_precision=ct.precision.FLOAT16, skip_model_load=True,
    )
    args.output.mkdir(parents=True)
    package = args.output / "LineArt.mlpackage"
    converted.save(str(package))
    report = {"source_sha256": expected, "torch": torch.__version__, "coremltools": ct.__version__,
              "precision": "float16", "input_shapes": shapes, "compute_units": "ALL", "edge": args.edge,
              "reference_device": args.reference_device,
              "verification_device": "Mac (conversion parity only, not phone timing)", "images": []}
    started = time.perf_counter()
    mobile = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.ALL)
    report["mac_load_seconds"] = time.perf_counter() - started
    model.to(args.reference_device)
    for case in json.loads((args.data / "inputs.json").read_text())["cases"]:
        image_id = case["id"]
        with Image.open(args.data / case["input"]) as source:
            photo, tensor = normalize(source, args.edge)
        photo.save(args.output / f"{image_id}-input.png")
        width, height = photo.size
        with torch.inference_mode():
            reference = model(tensor.to(args.reference_device)).cpu().numpy()
        if args.reference_device == "mps":
            torch.mps.empty_cache()
        started = time.perf_counter()
        actual = mobile.predict({"image": tensor.numpy()})["line"]
        elapsed = time.perf_counter() - started
        assert actual.shape == reference.shape and np.isfinite(actual).all()
        assert actual.min() >= 0 and actual.max() <= 1
        delta = np.abs(actual - reference)
        gray = np.rint(actual[0, 0, :height, :width] * 255).astype(np.uint8)
        reference_gray = np.rint(reference[0, 0, :height, :width] * 255).astype(np.uint8)
        with Image.open(args.data / "style1-detail" / f"{image_id}.png") as saved:
            if saved.size == photo.size:
                saved_error = np.abs(reference_gray.astype(float) - np.array(saved))
                if args.reference_device == "cpu":
                    assert saved_error.max() == 0, "Reference pipeline changed"
                else:
                    assert saved_error.mean() < .05, "Reference backend differs materially"
        Image.fromarray(gray).save(args.output / f"{image_id}-gray.png")
        compose(photo, Image.fromarray(gray))[0].save(args.output / f"{image_id}.png")
        row = {"id": image_id, "shape": list(actual.shape), "mac_inference_seconds": elapsed,
               "mae": float(delta.mean()), "max_error": float(delta.max()),
               "p99_error": float(np.quantile(delta, .99)),
               "gray_mae_levels": float(np.abs(gray.astype(float) - reference_gray).mean())}
        report["images"].append(row)
        print(json.dumps(row), flush=True)
        (args.output / "conversion.json").write_text(json.dumps(report, indent=2) + "\n")
        assert row["mae"] < .01 and row["p99_error"] < .05, "Conversion changes lineart; inspect"
    report["package_files_sha256"] = {str(p.relative_to(package)): hashlib.sha256(p.read_bytes()).hexdigest()
                                      for p in sorted(package.rglob("*")) if p.is_file()}
    (args.output / "conversion.json").write_text(json.dumps(report, indent=2) + "\n")
    print("PASS: requested image shapes, finite outputs, unchanged reference sizes, FP16 numerical parity")


if __name__ == "__main__":
    main()
