"""Deterministic SmolVLM2 English-description to PhotoAnalysis adapter.

The model's free-form English description is an input only.  This module
returns canonical Korean values from the fixed ontology and never persists or
returns the raw description.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Final, TypedDict


class PhotoAnalysis(TypedDict):
    scene: str | None
    semantic_tags: list[str]
    mood: list[str]
    ai_field_note: str


class OntologyEntry(TypedDict):
    label: str
    aliases: tuple[str, ...]


# Keep labels short and stable: these are the only values that can reach the
# product contract.  Aliases are English because SmolVLM2 is run in English.
TAG_ONTOLOGY: Final[tuple[OntologyEntry, ...]] = (
    {"label": "커피", "aliases": ("coffee", "espresso", "cappuccino", "latte", "mug")},
    {"label": "컵", "aliases": ("cup", "cups", "tumbler")},
    {"label": "모자", "aliases": ("hat", "head covering")},
    {"label": "옷", "aliases": ("dress", "clothing", "shirt")},
    {"label": "테이블", "aliases": ("table", "tables", "desk")},
    {"label": "쟁반", "aliases": ("tray",)},
    {"label": "창문", "aliases": ("window", "windows", "windowsill", "window ledge")},
    {"label": "의자", "aliases": ("chair", "chairs", "stool", "stools")},
    {"label": "계단", "aliases": ("stair", "stairs", "staircase")},
    {"label": "실내", "aliases": ("interior", "indoors", "indoor", "room")},
    {"label": "카페", "aliases": ("cafe", "coffee shop", "restaurant")},
    {"label": "사람", "aliases": ("person", "people", "woman", "man", "child", "human")},
    {"label": "얼굴", "aliases": ("face", "head")},
    {"label": "조각", "aliases": ("sculpture", "statue")},
    {"label": "장신구", "aliases": ("earrings", "jewelry")},
    {"label": "손", "aliases": ("hand",)},
    {"label": "실루엣", "aliases": ("silhouette",)},
    {"label": "거리", "aliases": ("street", "road", "alley", "roadway", "pavement")},
    {"label": "건물", "aliases": ("building", "buildings", "house", "facade", "architecture")},
    {"label": "도시", "aliases": ("city", "town", "urban")},
    {"label": "산", "aliases": ("mountain", "mountains", "cliff", "cliffs", "hill", "hills")},
    {"label": "계곡", "aliases": ("valley", "gorge", "canyon")},
    {"label": "숲", "aliases": ("forest", "woods", "woodland", "trees")},
    {"label": "나무", "aliases": ("tree", "trees")},
    {"label": "식물", "aliases": ("plant", "plants", "leaf", "leaves", "foliage")},
    {"label": "꽃", "aliases": ("flower", "flowers", "blossom")},
    {"label": "바다", "aliases": ("sea", "ocean", "water", "shoreline", "coast")},
    {"label": "호수", "aliases": ("lake", "pond")},
    {"label": "강", "aliases": ("river", "stream", "waterfall")},
    {"label": "등대", "aliases": ("lighthouse",)},
    {"label": "배", "aliases": ("boat", "sailboat")},
    {"label": "부두", "aliases": ("pier",)},
    {"label": "다리", "aliases": ("bridge",)},
    {"label": "들판", "aliases": ("field", "meadow")},
    {"label": "하늘", "aliases": ("sky", "cloud", "clouds")},
    {"label": "비", "aliases": ("rain", "rainy", "raindrop", "raindrops")},
    {"label": "우산", "aliases": ("umbrella", "umbrellas")},
    {"label": "음식", "aliases": ("food", "meal", "dish", "breakfast", "lunch", "dinner")},
    {"label": "그릇", "aliases": ("plate", "plates", "bowl", "bowls")},
    {"label": "빵", "aliases": ("bread", "sandwich", "burger", "bun")},
    {"label": "지도", "aliases": ("map",)},
    {"label": "기계", "aliases": ("machine", "equipment")},
    {"label": "표면", "aliases": ("surface", "color")},
    {"label": "조명", "aliases": ("light", "lights", "lamp", "lamps", "lighting")},
    {"label": "길", "aliases": ("path", "pathway", "trail", "walkway")},
)

MOOD_ONTOLOGY: Final[tuple[OntologyEntry, ...]] = (
    {"label": "따뜻함", "aliases": ("warm", "warmth", "golden")},
    {"label": "포근함", "aliases": ("cozy", "cosy", "comforting", "gentle")},
    {"label": "차분함", "aliases": ("calm", "quiet", "peaceful", "serene")},
    {"label": "활기참", "aliases": ("lively", "vibrant", "busy", "energetic", "dynamic")},
    {"label": "밝음", "aliases": ("bright", "sunny", "light-filled")},
    {"label": "어두움", "aliases": ("dark", "dim", "shadowy", "night", "moody", "muted")},
    {"label": "비 오는", "aliases": ("rainy", "wet", "drizzly")},
    {"label": "신비로움", "aliases": ("mysterious", "misty", "dreamlike")},
    {"label": "고전적", "aliases": ("rustic", "historic", "old-fashioned")},
    {"label": "그리움", "aliases": ("nostalgic", "nostalgia", "wistful")},
    {"label": "웅장함", "aliases": ("majestic", "dramatic", "grand")},
    {"label": "싱그러움", "aliases": ("lush", "fresh", "green")},
    {"label": "시원함", "aliases": ("cool", "refreshing", "clear")},
)

# These words must never become tags, scene text, or moods.  Their presence is
# recorded only as a rejection count by callers; the raw sentence is dropped.
BANNED_TERMS: Final[frozenset[str]] = frozenset(
    {
        "italy", "france", "paris", "london", "rome", "new york", "fos-sur-mer",
        "chef", "waiter", "waitress", "employee", "worker", "bartender", "customer",
        "walking", "walked", "running", "working", "drinking", "eating", "talking",
        "driving", "traveling", "travelling", "celebrating", "shopping", "speaking",
    }
)

def _contains(text: str, alias: str) -> bool:
    pattern = r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])"
    return re.search(pattern, text) is not None


def _labels(text: str, ontology: tuple[OntologyEntry, ...], limit: int) -> list[str]:
    labels: list[str] = []
    for entry in ontology:
        if any(_contains(text, alias) for alias in entry["aliases"]):
            labels.append(entry["label"])
            if len(labels) == limit:
                break
    return labels


def adapt_description(description: str | None) -> PhotoAnalysis:
    """Map one English SmolVLM2 description to the PhotoAnalysis schema.

    Unknown words, proper nouns, jobs, and actions are ignored.  Only fixed
    ontology labels are emitted, and duplicate aliases resolve to one label.
    """

    text = (description or "").casefold()
    for term in BANNED_TERMS:
        text = re.sub(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", " ", text)
    tags = _labels(text, TAG_ONTOLOGY, 8)
    moods = _labels(text, MOOD_ONTOLOGY, 3)
    # A banned term cannot be emitted because no banned term is in either
    # ontology.  Keep safe visual labels from the same description.
    if not tags:
        scene = None
    else:
        scene = "·".join(tags[:3]) + " 장면"
    return {"scene": scene, "semantic_tags": tags, "mood": moods, "ai_field_note": ""}


def validate_photo_analysis(value: PhotoAnalysis) -> None:
    """Small contract guard shared by the experiment check."""

    assert set(value) == {"scene", "semantic_tags", "mood", "ai_field_note"}
    assert value["scene"] is None or len(value["scene"]) <= 120
    assert len(value["semantic_tags"]) <= 8 and len(value["mood"]) <= 3
    assert len(value["semantic_tags"]) == len(set(value["semantic_tags"]))
    assert len(value["mood"]) == len(set(value["mood"]))
    assert all(0 < len(tag) <= 24 for tag in value["semantic_tags"] + value["mood"])
    assert value["ai_field_note"] == ""
    serialized = " ".join(value["semantic_tags"] + value["mood"]) + (value["scene"] or "")
    assert not any(term in serialized.casefold() for term in BANNED_TERMS)


if __name__ == "__main__":
    value = adapt_description(sys.stdin.read())
    validate_photo_analysis(value)
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
