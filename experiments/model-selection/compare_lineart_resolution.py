"""Create a local HTML comparison for the L02 device resolution runs."""
import argparse
import hashlib
import json
import shutil
import statistics
from html import escape
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

from colorize_lineart import compose


CASE = "L02"
TARGET = (829, 1024)
DEVICE_NAMES = {"iPad14,1": "iPad mini 6", "iPad14,2": "iPad mini 6"}
CROPS = {
    "얼굴": (0.65, 0.42, 0.20, 0.18),
    "손·컵": (0.60, 0.54, 0.24, 0.19),
    "옷 무늬": (0.22, 0.43, 0.38, 0.27),
    "진열대": (0.40, 0.70, 0.34, 0.18),
}


def rect(size, normalized):
    width, height = size
    x, y, w, h = normalized
    return (round(x * width), round(y * height), round((x + w) * width), round((y + h) * height))


def self_check():
    box1 = rect((829, 1024), CROPS["얼굴"])
    box2 = rect((1658, 2048), CROPS["얼굴"])
    assert all(abs(second - first * 2) <= 1 for first, second in zip(box1, box2))


def load_run(folder):
    run_file = folder / "run.json"
    if not run_file.is_file():
        raise SystemExit(f"run.json 없음: {run_file}")
    return json.loads(run_file.read_text())


def rows(run):
    found = [row for row in run.get("rows", []) if row.get("mode") == "original" and row.get("id") == CASE]
    if len(found) != 6 or {row.get("round") for row in found} != set(range(6)):
        raise SystemExit(f"{CASE} original round 0..5 기록이 필요합니다")
    return sorted(found, key=lambda row: row["round"])


def verify(folder, run):
    assert run.get("physical_device") and run.get("self_checks") == "passed"
    measured = rows(run)
    stages = ["decode_seconds", "prepare_seconds", "inference_seconds", "color_seconds", "png_write_seconds"]
    source = Image.open(folder / f"original-{CASE}-input.png").convert("RGB")
    mask = Image.open(folder / f"original-{CASE}-gray.png").convert("L")
    expected = compose(source, mask)[0]
    expected_size = TARGET if run["edge"] == 1024 else (1243, 1536)
    assert source.size == mask.size == expected_size
    hashes = {}
    for row in measured:
        assert all(row[k] >= 0 for k in stages)
        assert abs(sum(row[k] for k in stages) - row["total_seconds"]) < 1e-8
        path = folder / f"original-r{row['round']}-{CASE}.png"
        actual = Image.open(path).convert("RGB")
        assert actual.size == expected_size
        assert ImageChops.difference(actual, expected).getbbox() is None, "Color composite or repeat changed"
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"color_composite_exact": True, "repeat_pixels_exact": True, "stages_accounted": True, "png_sha256": hashes}


def timing(run):
    values = [float(row["total_seconds"]) for row in rows(run)]
    warm = values[1:]
    return {"first": values[0], "warm_median": statistics.median(warm),
            "warm_min": min(warm), "warm_max": max(warm)}


def device_name(run):
    hardware = str(run.get("hardware", "알 수 없는 기기"))
    return DEVICE_NAMES.get(hardware, hardware)


def memory(run):
    value = run.get("memory_finished", {}).get("peak_physical_footprint_bytes")
    return f"{value / 1024 ** 2:.1f} MiB" if value is not None else "미측정"


def copy_input(folder, output):
    source = folder / f"original-{CASE}-input.png"
    if not source.is_file():
        raise SystemExit(f"원본 입력 없음: {source}")
    target = output / "original-L02-input.png"
    shutil.copy2(source, target)
    return target


def save_image(source, target, size=None):
    with Image.open(source) as image:
        image = image.convert("RGB")
        if size:
            image = image.resize(size, Image.Resampling.LANCZOS)
        image.save(target)


def make_crop(source, target, normalized):
    with Image.open(source) as image:
        crop = image.convert("RGB").crop(rect(image.size, normalized))
        canvas = Image.new("RGB", (480, 320), "white")
        crop = ImageOps.contain(crop, canvas.size, Image.Resampling.LANCZOS)
        canvas.paste(crop, ((480 - crop.width) // 2, (320 - crop.height) // 2))
        canvas.save(target)


def img(path, alt):
    return f'<img src="{escape(path)}" alt="{escape(alt)}" loading="lazy">'


def seconds(value):
    return f"{value:.3f}초"


def write_html(output, baseline, detail, base_time, detail_time, memories, edges, device):
    delta = detail_time["warm_median"] - base_time["warm_median"]
    ratio = detail_time["warm_median"] / base_time["warm_median"] if base_time["warm_median"] else 0
    memory_note = f"앱 프로세스 최대 메모리: 1024px {memories[0]} · 1536px {memories[1]} (OS footprint; 미리보기 포함, 별도 시스템 서비스의 메모리는 제외)"
    cards = []
    for title, normalized in CROPS.items():
        cards.append(f'<section><h3>{title}</h3><div class="triptych">'
                     f'<figure>{img(f"crop-{title}-source.png", "원본 " + title)}<figcaption>원본</figcaption></figure>'
                     f'<figure>{img(f"crop-{title}-baseline.png", "1024px " + title)}<figcaption>1024px</figcaption></figure>'
                     f'<figure>{img(f"crop-{title}-detail.png", "1536px " + title)}<figcaption>1536px</figcaption></figure>'
                     "</div></section>")
    html = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(device)} · 선화 1024px · 1536px 비교</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#fafaf7;color:#252522;font:15px/1.5 system-ui,sans-serif}}main{{width:min(100%,960px);margin:auto;padding:24px 16px 48px}}h1{{font-size:clamp(1.5rem,6vw,2.3rem);line-height:1.2}}h2{{margin-top:32px}}h3{{margin:20px 0 8px}}.note{{color:#666}}.full,.triptych{{display:grid;gap:10px}}.full{{grid-template-columns:repeat(3,minmax(0,1fr))}}.triptych{{grid-template-columns:repeat(3,minmax(0,1fr))}}figure{{margin:0;min-width:0}}img{{display:block;width:100%;height:auto;background:white;border:1px solid #ddd}}figcaption{{padding-top:4px;font-size:13px;color:#555}}table{{width:100%;border-collapse:collapse;margin:16px 0;font-variant-numeric:tabular-nums}}th,td{{padding:8px 6px;text-align:left;border-bottom:1px solid #ddd}}th{{background:#eee}}.scroll{{overflow-x:auto}}@media(max-width:520px){{main{{padding:18px 12px 36px}}.full,.triptych{{grid-template-columns:1fr}}table{{font-size:13px}}}}</style><main>
<h1>{escape(device)} · 1024px와 1536px</h1><p>같은 카페 원본을 기기에서 직접 변환했습니다. 1536px 결과도 같은 표시 크기로 맞춰 비교합니다.</p><p>사진 읽기·축소·선화 생성·원본색 마스킹·PNG 저장까지 측정했습니다. 해상도별 첫 변환 1회와 반복 5회를 실행했습니다. 기기에는 각 해상도의 PNG를 저장하며, 비교 페이지의 추가 축소는 측정 시간 밖입니다.</p>
<h2>전체 이미지</h2><div class="full"><figure>{img("original-L02-input.png", "원본 사진")}<figcaption>원본 사진</figcaption></figure><figure>{img("baseline-L02.png", "1024px 결과")}<figcaption>1024px · 829×1024</figcaption></figure><figure>{img("detail-L02-preview.png", "1536px 결과를 829x1024로 축소")}<figcaption>1536px · {edges[1]} · <a href="detail-L02-original.png" download>고해상도 PNG 다운로드</a></figcaption></figure></div>
<h2>시간 비교</h2><div class="scroll"><table><tr><th></th><th>1024px</th><th>1536px</th><th>증가량</th><th>배율</th></tr><tr><th>첫 변환</th><td>{seconds(base_time["first"])}</td><td>{seconds(detail_time["first"])}</td><td>{seconds(detail_time["first"] - base_time["first"])}</td><td>{detail_time["first"] / base_time["first"]:.2f}×</td></tr><tr><th>반복 중앙값</th><td>{seconds(base_time["warm_median"])}</td><td>{seconds(detail_time["warm_median"])}</td><td>{seconds(delta)}</td><td>{ratio:.2f}×</td></tr><tr><th>반복 범위</th><td>{seconds(base_time["warm_min"])}–{seconds(base_time["warm_max"])}</td><td>{seconds(detail_time["warm_min"])}–{seconds(detail_time["warm_max"])}</td><td colspan="2"></td></tr></table></div><p class="note">모델 준비 시간: 첫 실행 {seconds(float(baseline["model_load_seconds"]))} · 다음 실행 {seconds(float(detail["model_load_seconds"]))}. 동일 모델을 순서대로 실행해 시스템 캐시 상태가 다르므로 준비 시간을 해상도의 차이로 해석하지 않습니다.</p><p class="note">{escape(memory_note)}</p>
<h2>같은 영역 확대</h2><p class="note">두 결과를 같은 크기로 맞춘 뒤 동일한 영역을 동일한 배율로 확대했습니다. 원본 사진은 1024px 입력입니다.</p>{''.join(cards)}
</main></html>'''
    (output / "index.html").write_text(html, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True, help="1024px device run directory")
    parser.add_argument("--detail", type=Path, required=True, help="1536px device run directory")
    parser.add_argument("--output", type=Path, required=True, help="new output directory")
    args = parser.parse_args()
    self_check()
    for folder in (args.baseline, args.detail):
        if not folder.is_dir():
            raise SystemExit(f"디렉터리 없음: {folder}")
    if args.output.exists():
        raise SystemExit(f"출력 디렉터리가 이미 있습니다(overwrite 금지): {args.output}")
    base, detail = load_run(args.baseline), load_run(args.detail)
    if not base.get("completed") or not detail.get("completed"):
        raise SystemExit("completed=true인 run.json이 필요합니다")
    if base.get("edge") != 1024 or detail.get("edge") != 1536:
        raise SystemExit("run.json edge가 baseline=1024, detail=1536이어야 합니다")
    if not base.get("hardware") or not detail.get("hardware") or base.get("hardware") != detail.get("hardware"):
        raise SystemExit("baseline과 detail은 같은 hardware의 run이어야 합니다")
    base_rows, detail_rows = rows(base), rows(detail)
    verification = {"1024": verify(args.baseline, base), "1536": verify(args.detail, detail)}
    args.output.mkdir(parents=True)
    copy_input(args.baseline, args.output)
    base_out = args.baseline / f"original-r0-{CASE}.png"
    detail_out = args.detail / f"original-r0-{CASE}.png"
    for path in (base_out, detail_out, args.detail / f"original-{CASE}-input.png"):
        if not path.is_file():
            raise SystemExit(f"필수 이미지 없음: {path}")
    save_image(base_out, args.output / "baseline-L02.png")
    shutil.copy2(detail_out, args.output / "detail-L02-original.png")
    save_image(detail_out, args.output / "detail-L02-preview.png", TARGET)
    for title, normalized in CROPS.items():
        make_crop(args.baseline / f"original-{CASE}-input.png", args.output / f"crop-{title}-source.png", normalized)
        make_crop(base_out, args.output / f"crop-{title}-baseline.png", normalized)
        make_crop(args.output / "detail-L02-preview.png", args.output / f"crop-{title}-detail.png", normalized)
    write_html(args.output, base, detail, timing(base), timing(detail), [memory(base), memory(detail)], (base.get("edge"), detail.get("edge")), device_name(base))
    summary = {"device": device_name(base), "os": base.get("os"), "baseline": timing(base), "detail": timing(detail), "verification": verification}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(f"생성 완료: {args.output / 'index.html'} ({len(base_rows)}+{len(detail_rows)} rows)")


if __name__ == "__main__":
    main()
