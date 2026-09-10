"""Check actual device artifacts and summarize first/warm timings without mixing input modes."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path

import numpy as np
from PIL import Image

from colorize_lineart import compose


def pixels(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGB"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--phone", type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.phone / "run.json").read_text())
    assert report["completed"] and report["physical_device"] and report["self_checks"] == "passed"
    rows = report["rows"]
    assert len(rows) == 40 and len({(r['mode'], r['id'], r['round']) for r in rows}) == 40
    summary = {"hardware": report["hardware"], "os": report["os"], "model_load_seconds": report["model_load_seconds"],
               "run_sha256": hashlib.sha256((args.phone / "run.json").read_bytes()).hexdigest(), "images": []}
    stages = ["decode_seconds", "prepare_seconds", "inference_seconds", "color_seconds", "png_write_seconds"]
    for mode in ["original", "normalized"]:
        for index in range(1, 6):
            image_id = f"L{index:02d}"
            group = sorted((r for r in rows if r["mode"] == mode and r["id"] == image_id), key=lambda r: r["round"])
            assert [r["round"] for r in group] == [0, 1, 2, 3]
            for r in group:
                assert all(r[k] >= 0 for k in stages)
                assert abs(sum(r[k] for k in stages) - r["total_seconds"]) < 1e-8
            source = args.phone / f"{mode}-{image_id}-input.png"
            gray = args.phone / f"{mode}-{image_id}-gray.png"
            output = args.phone / f"{mode}-r0-{image_id}.png"
            with Image.open(source) as photo, Image.open(gray) as mask:
                expected, _ = compose(photo, mask)
                actual = pixels(output)
                assert np.array_equal(actual, np.array(expected)), "Native color mask/composite differs"
                assert photo.size == (group[0]["width"], group[0]["height"]) == mask.size
                assert np.ptp(np.array(mask)) > 100, "Degenerate line output"
            reference_source = pixels(args.data / "style1-detail" / f"{image_id}-input.png")
            source_diff = np.abs(pixels(source).astype(float) - reference_source)
            if mode == "normalized":
                assert source_diff.max() == 0, "Exact normalized input changed on iPhone"
            gray_diff = np.abs(pixels(gray).astype(float) - pixels(args.data / "style1-detail" / f"{image_id}.png"))
            if mode == "normalized":
                assert gray_diff.mean() / 255 < .01 and np.quantile(gray_diff, .99) / 255 < .05, "Device model parity failed"
            warm = group[1:]
            repeat = [float(np.abs(pixels(args.phone / f"{mode}-r{r}-{image_id}.png").astype(float) - actual).max()) for r in [1, 2, 3]]
            row = {"mode": mode, "id": image_id, "size": [group[0]["width"], group[0]["height"]],
                   "first_seconds": group[0]["total_seconds"],
                   "warm_median_seconds": statistics.median(r["total_seconds"] for r in warm),
                   "warm_min_seconds": min(r["total_seconds"] for r in warm),
                   "warm_max_seconds": max(r["total_seconds"] for r in warm),
                   "warm_stage_medians": {k: statistics.median(r[k] for r in warm) for k in stages},
                   "source_rgb_mae": float(source_diff.mean()), "source_rgb_max_error": float(source_diff.max()),
                   "gray_mae_levels": float(gray_diff.mean()), "gray_p99_error_levels": float(np.quantile(gray_diff, .99)),
                   "gray_max_error_levels": float(gray_diff.max()), "native_composite_byte_equal": True,
                   "repeat_max_rgb_error": repeat, "png_sha256": hashlib.sha256(output.read_bytes()).hexdigest()}
            assert max(repeat) <= 2, "Repeated identical predictions changed materially"
            summary["images"].append(row)
            print(json.dumps(row), flush=True)
    (args.phone / "verified-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print("PASS: 40 physical-device runs, stage accounting, exact normalized inputs, line parity, exact color mask, repeat stability")


if __name__ == "__main__":
    main()
