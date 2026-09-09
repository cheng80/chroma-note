#!/usr/bin/env python3
"""Local-only similarity helper for source -> target/candidate image pairs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

PAPER_PADDING = (238, 238, 234)
IMAGE_SIZE = (224, 224)
LBP_SIZE = (128, 128)
HSV_BINS = (12, 4, 4)
SATURATION_CUTOFF = 0.12


def padded_rgb(value: str | Path | Image.Image) -> Image.Image:
    image = value if isinstance(value, Image.Image) else Image.open(value)
    return ImageOps.pad(image.convert("RGB"), IMAGE_SIZE, method=Image.Resampling.LANCZOS,
                        color=PAPER_PADDING, centering=(0.5, 0.5))


def _cosine(left: np.ndarray, right: np.ndarray) -> float:
    left_norm, right_norm = np.linalg.norm(left), np.linalg.norm(right)
    if left_norm == 0 and right_norm == 0:
        return 1.0
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return float(np.dot(left, right) / (left_norm * right_norm))


def hsv_descriptor(image: Image.Image) -> tuple[np.ndarray, dict[str, float | bool]]:
    hsv = np.asarray(image.convert("HSV"), dtype=np.float32) / 255.0
    saturation, value = hsv[..., 1], hsv[..., 2]
    colorless = saturation < SATURATION_CUTOFF
    paper = colorless & (value >= 0.86)
    chromatic = ~colorless
    if chromatic.any():
        hist = np.histogramdd(
            hsv[chromatic], bins=HSV_BINS,
            range=((0.0, 1.0), (SATURATION_CUTOFF, 1.0), (0.0, 1.0)),
        )[0].astype(np.float64)
        hist /= hist.sum()
    else:
        hist = np.zeros(int(np.prod(HSV_BINS)), dtype=np.float64)
    return hist.ravel(), {
        "histogram_empty": not bool(chromatic.any()),
        "colorless_fraction": float(colorless.mean()),
        "paper_fraction": float(paper.mean()),
    }


def hsv_similarity(left: Image.Image, right: Image.Image) -> dict[str, Any]:
    left_hist, left_info = hsv_descriptor(left)
    right_hist, right_info = hsv_descriptor(right)
    return {
        "target_similarity": _cosine(left_hist, right_hist),
        "left": left_info,
        "right": right_info,
        "empty_histogram_rule": "both empty=1.0; exactly one empty=0.0",
    }


def lbp_histogram(image: Image.Image) -> np.ndarray:
    gray = np.asarray(image.convert("L").resize(LBP_SIZE, Image.Resampling.BILINEAR), dtype=np.uint8)
    padded = np.pad(gray, 1, mode="edge")
    center = padded[1:-1, 1:-1]
    code = np.zeros_like(center, dtype=np.uint8)
    neighbors = ((-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1))
    for bit, (dy, dx) in enumerate(neighbors):
        code |= ((padded[1 + dy:129 + dy, 1 + dx:129 + dx] >= center).astype(np.uint8) << bit)
    hist = np.bincount(code.ravel(), minlength=256).astype(np.float64)
    return hist / hist.sum()

def lbp_similarity(left: Image.Image, right: Image.Image) -> float:
    return float(np.minimum(lbp_histogram(left), lbp_histogram(right)).sum())

def _load_dino(model_path: Path):
    import torch
    from transformers import AutoModel
    from transformers.models.bit.image_processing_pil_bit import BitImageProcessorPil

    processor = BitImageProcessorPil.from_pretrained(
        str(model_path), local_files_only=True, trust_remote_code=False
    )
    model = AutoModel.from_pretrained(
        str(model_path), local_files_only=True, trust_remote_code=False, use_safetensors=True
    ).to("cpu").eval()
    return torch, processor, model

def _dino_vector(image: Image.Image, torch: Any, processor: Any, model: Any) -> np.ndarray:
    inputs = processor(images=image, do_resize=False, do_center_crop=False, return_tensors="pt")
    with torch.inference_mode():
        output = model(**inputs)
        vector = torch.nn.functional.normalize(output.last_hidden_state[:, 0], dim=-1)
    return vector[0].cpu().numpy()

def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def _input_record(path: Path) -> dict[str, Any]:
    return {"path": str(path.resolve()), "sha256": _sha256(path)}

def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    model_path = Path(args.model_path).expanduser().resolve()
    if not model_path.is_dir():
        raise SystemExit(f"--model-path must be a local directory: {model_path}")
    paths = [Path(args.source), Path(args.target), *(Path(p) for p in args.candidates)]
    images = {str(path): padded_rgb(path) for path in paths}
    torch, processor, model = _load_dino(model_path)
    vectors = {key: _dino_vector(image, torch, processor, model) for key, image in images.items()}
    source_key, target_key = str(paths[0]), str(paths[1])
    source_target = _cosine(vectors[source_key], vectors[target_key])
    source_target_hsv = hsv_similarity(images[source_key], images[target_key])
    source_target_lbp = lbp_similarity(images[source_key], images[target_key])
    candidates = []
    for path in paths[2:]:
        key = str(path)
        hsv = hsv_similarity(images[target_key], images[key])
        candidates.append({
            "input": _input_record(path),
            "dino_cls_cosine": {
                "source_candidate": _cosine(vectors[source_key], vectors[key]),
                "target_candidate": _cosine(vectors[target_key], vectors[key]),
            },
            "hsv_color_histogram_cosine": hsv,
            "lbp_histogram_intersection": {
                "target_similarity": lbp_similarity(images[target_key], images[key]),
                "fixed_size": 128,
                "neighbors": 8,
            },
        })
    return {
        "kind": "ai_conversion_similarity_auxiliary",
        "automatic_decision": {
            "is_pass_probability": False,
            "is_ground_truth": False,
            "automatic_pass": False,
            "note": "수치는 합격 확률·정답·전체 자동 PASS가 아니다. 메인의 AI 시각 검토가 필요하다.",
            "hard_gates": ["인물 수", "pose", "핵심 사물", "배치", "컬러 잉크 질감"],
            "hard_gate_owner": "main AI visual review",
        },
        "model": {
            "family": "DINOv2-small",
            "path": str(model_path),
            "local_revision": model_path.name,
            "loading": {
                "local_files_only": True, "trust_remote_code": False,
                "use_safetensors": True, "device": "cpu", "eval": True,
                "inference_mode": True,
            },
        },
        "preprocessing": {
            "image": "PIL.ImageOps.pad RGB 224x224",
            "paper_padding_rgb": list(PAPER_PADDING),
            "processor": "official local BitImageProcessorPil normalization only",
            "processor_kwargs": {"do_resize": False, "do_center_crop": False},
            "cls_vector": "last_hidden_state[:, 0], L2 normalized, cosine",
            "auxiliary": "HSV histogram on padded RGB; LBP on grayscale resized to 128x128",
        },
        "inputs": {
            "source": _input_record(paths[0]), "target": _input_record(paths[1]),
        },
        "baseline": {
            "dino_cls_cosine": {"source_target_baseline": source_target},
            "hsv_color_histogram_cosine": {"source_target_baseline": source_target_hsv},
            "lbp_histogram_intersection": {"source_target_baseline": source_target_lbp},
        },
        "candidates": candidates,
    }

def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--source", required=True, type=Path)
    result.add_argument("--target", required=True, type=Path)
    result.add_argument("--candidates", required=True, nargs="+", type=Path)
    result.add_argument("--model-path", required=True, type=Path)
    result.add_argument("--out", required=True, type=Path)
    return result

def main() -> int:
    args = parser().parse_args()
    if args.out.exists():
        raise SystemExit(f"--out must be a fresh path: {args.out}")
    result = evaluate(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
