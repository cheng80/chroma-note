"""Mask unquantized photo RGB onto existing lineart, without altering line geometry."""

import argparse
import hashlib
import json
import time
from pathlib import Path

from PIL import Image, ImageChops


LINE_GAIN = 1.8


def compose(source, lineart):
    if source.size != lineart.size:
        raise ValueError("Photo and line mask must have matching sizes")
    source = source.convert("RGB")
    alpha = lineart.convert("L").point([min(255, round((255 - value) * LINE_GAIN)) for value in range(256)])
    support = alpha.point(lambda p: 255 if p else 0)
    layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
    layer.paste(source, mask=support)
    layer.putalpha(alpha)
    result = Image.alpha_composite(Image.new("RGBA", source.size, "white"), layer).convert("RGB")
    return result, layer


def self_test():
    source = Image.new("RGB", (3, 1))
    source.putdata([(235, 32, 18), (14, 90, 230), (10, 170, 40)])
    mask = Image.new("L", source.size)
    mask.putdata([0, 200, 255])
    result, layer = compose(source, mask)
    assert layer.getpixel((0, 0))[:3] == source.getpixel((0, 0))
    assert layer.getpixel((1, 0))[:3] == source.getpixel((1, 0))
    assert list(layer.getchannel("A").tobytes()) == [255, 99, 0]
    assert layer.getpixel((2, 0)) == (0, 0, 0, 0), "Transparent pixels must not retain photo RGB"
    assert result.getpixel((2, 0)) == (255, 255, 255), "Outside the lines stays white"
    assert result.getpixel((0, 0)) == source.getpixel((0, 0))
    assert layer.tobytes() == compose(source, mask)[1].tobytes()
    try:
        compose(source, Image.new("L", (1, 1)))
    except ValueError:
        pass
    else:
        raise AssertionError("Mismatched sizes must fail")
    print("PASS: exact source RGB, no stroke expansion/fill, stronger alpha, white background, repeatability, size guard")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.input or not args.output or args.output.exists():
        parser.error("input and a new output directory are required")
    previous = json.loads((args.input / "run.json").read_text())
    if not previous["images"]:
        parser.error("input run has no images")
    args.output.mkdir(parents=True)
    report = {
        "method": "source RGB through original line mask, pointwise alpha gain only",
        "line_gain": LINE_GAIN, "background": "#FFFFFF", "quantization": None,
        "stroke_expansion": 0, "interior_suppression": False, "color_fill": False,
        "mobile": "NOT_TESTED", "device": "Mac CPU",
        "timing_scope": "mask/composite only; excludes model inference, decoding, imports",
        "source_run_sha256": hashlib.sha256((args.input / "run.json").read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "images": [],
    }
    for item in previous["images"]:
        image_id = item["id"]
        if Path(image_id).name != image_id:
            raise ValueError("Image ID must be a filename stem")
        line_path = args.input / (image_id + ".png")
        if hashlib.sha256(line_path.read_bytes()).hexdigest() != item["png_sha256"]:
            raise ValueError("Original lineart hash changed")
        photo_path = args.input / (image_id + "-input.png")
        with Image.open(photo_path) as photo, Image.open(line_path) as mask:
            photo.load()
            mask.load()
            started = time.perf_counter()
            result, layer = compose(photo, mask)
            elapsed = time.perf_counter() - started
            original_support = ImageChops.invert(mask.convert("L")).point(lambda p: 255 if p else 0)
            new_support = layer.getchannel("A").point(lambda p: 255 if p else 0)
            assert original_support.tobytes() == new_support.tobytes(), "Line support must remain exact"
            expected_rgb = Image.composite(photo.convert("RGB"), Image.new("RGB", photo.size), new_support)
            assert expected_rgb.tobytes() == layer.convert("RGB").tobytes()
        result.save(args.output / (image_id + ".png"))
        layer.save(args.output / (image_id + "-lines.png"))
        row = {"id": image_id, "size": list(result.size), "processing_seconds": elapsed,
               "source_png_sha256": hashlib.sha256(photo_path.read_bytes()).hexdigest(),
               "png_sha256": hashlib.sha256((args.output / (image_id + ".png")).read_bytes()).hexdigest(),
               "exact_source_rgb_on_lines": True, "transparent_rgb_cleared": True, "exact_line_support": True}
        report["images"].append(row)
        print(json.dumps(row), flush=True)
    (args.output / "run.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
