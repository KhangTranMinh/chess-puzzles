"""Application facade: ties source images, processing, and caching together.

This is the public API that server.py calls.  It owns the cache coordination
(check if current, read, write) and the API response shape, but delegates
source-image concerns to image_repository.py and processing to
processing_pipeline.py.

Think of it as the use-case layer in an Android app: HTTP handlers call these
functions, but this code does not know anything about request paths or status
codes.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from backend.cache import ExerciseCache
from backend.image_repository import (
    InvalidImageNameError,
    SOURCE_DIRECTORY,
    SourceImageNotFoundError,
    UnsupportedImageFormatError,
    is_supported_image,
    source_images,
    validate_image_name,
)
from backend.processing_pipeline import (
    EXPECTED_BOARDS_PER_IMAGE,
    PROCESSING_LOCK,
    page_key,
    process_page,
)


# ── Paths ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIRECTORY = PROJECT_ROOT / "data"
BOARD_DIRECTORY = DATA_DIRECTORY / "boards"

# ── Singletons ───────────────────────────────────────────────────────────────
# The cache is a JSON file, not a database.  That is enough for this local app
# because all generated data can be recreated from puzzles-images/.
CACHE = ExerciseCache(DATA_DIRECTORY / "cache.json")


# ── Cache coordination ───────────────────────────────────────────────────────

def cache_is_current(entry: dict[str, Any], source: Path) -> bool:
    """Return true only when cache metadata and generated board files match.

    This checks both metadata and the actual files.  If someone deletes data/
    manually, the stale JSON entry will not trick the app into showing broken
    image URLs.
    """

    stat = source.stat()
    paths = entry.get("board_paths", [])
    return (
        entry.get("mtime_ns") == stat.st_mtime_ns
        and entry.get("size") == stat.st_size
        and entry.get("page_key") == page_key(source)
        and len(paths) == EXPECTED_BOARDS_PER_IMAGE
        and len(entry.get("predictions", [])) == EXPECTED_BOARDS_PER_IMAGE
        and all((BOARD_DIRECTORY / path).is_file() for path in paths)
    )


# ── API response builders ────────────────────────────────────────────────────

def image_summaries() -> list[dict[str, Any]]:
    """Return the small payload used by the image picker screen."""

    cache = CACHE.read()
    return [
        {
            "name": image_path.name,
            "processed": cache_is_current(cache.get(image_path.name, {}), image_path),
        }
        for image_path in source_images()
    ]


def build_exercises(source: Path, entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert cache data into the JSON shape consumed by the frontend.

    The API deliberately sends simple strings/numbers.  The browser should not
    need to understand local filesystem paths or cache internals.
    """

    predictions = entry.get("predictions", [])
    exercises = []
    for index, board_path in enumerate(entry["board_paths"]):
        prediction = predictions[index] if index < len(predictions) else {}
        exercises.append(
            {
                "id": f"{source.stem}-{index + 1}",
                "source_image": source.name,
                "board_index": index + 1,
                "image_url": f"/generated/{board_path}",
                "fen": prediction.get("fen"),
                "recognition_status": prediction.get("recognition_status", "recognizer_unavailable"),
            }
        )
    return exercises


# ── Public API (called by server.py) ─────────────────────────────────────────

def process_single_image(name: str) -> list[dict[str, Any]]:
    """Crop and recognize one named source image, using cache when possible.

    Validates first, then checks the cache.  On a miss, delegates to the
    processing pipeline and stores the result.
    """

    clean_name = validate_image_name(name)
    source = SOURCE_DIRECTORY / clean_name
    if not source.is_file():
        raise SourceImageNotFoundError(f"Image {clean_name} not found.")
    if not is_supported_image(source):
        raise UnsupportedImageFormatError(f"Unsupported image format: {source.suffix}")

    with PROCESSING_LOCK:
        cache = CACHE.read()
        entry = cache.get(clean_name, {})
        if not cache_is_current(entry, source):
            entry = process_page(source, BOARD_DIRECTORY)
            cache[clean_name] = entry
            CACHE.write(cache)

    return build_exercises(source, entry)


def clear_cache() -> None:
    """Delete generated board images and reset cache metadata.

    Deleting data/ is safe because it only contains generated outputs.
    Source photos live separately in puzzles-images/.
    """

    with PROCESSING_LOCK:
        if DATA_DIRECTORY.exists():
            shutil.rmtree(DATA_DIRECTORY)
        BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
        CACHE.write({})


def ensure_storage() -> None:
    """Create output folders required before serving generated files."""

    BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
