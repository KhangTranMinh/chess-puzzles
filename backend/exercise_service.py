"""Application logic for turning page photos into puzzle exercises.

This module is intentionally separate from ``server.py``.  Think of it like
the repository layer/use-case layer in an Android app: HTTP handlers call these
functions, but this code does not know anything about request paths or status
codes.
"""

from __future__ import annotations

import shutil
import threading
from pathlib import Path
from typing import Any

import cv2

from backend.board_splitter import BoardDetectionError, load_image, split_page
from backend.cache import ExerciseCache
from backend.recognizer import recognize_fen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = PROJECT_ROOT / "puzzles-images"
DATA_DIRECTORY = PROJECT_ROOT / "data"
BOARD_DIRECTORY = DATA_DIRECTORY / "boards"
IMAGE_EXTENSIONS = {".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"}
EXPECTED_BOARDS_PER_IMAGE = 6

# The cache is a JSON file, not a database. That is enough for this local app
# because all generated data can be recreated from puzzles-images/.
CACHE = ExerciseCache(DATA_DIRECTORY / "cache.json")

# The HTTP server can process multiple browser requests at the same time.
# Cropping and cache writes touch shared files, so serialize that section.
PROCESSING_LOCK = threading.Lock()


class ExerciseServiceError(RuntimeError):
    """Base class for user-facing processing errors.

    The server returns ``error_code`` separately from the English message.
    That gives the web app a stable value to translate into Vietnamese without
    trying to parse free-form English text.
    """

    error_code = "processing_failed"


class InvalidImageNameError(ExerciseServiceError):
    """Raised when a request tries to address a path instead of one image file."""

    error_code = "invalid_image_name"


class SourceImageNotFoundError(ExerciseServiceError):
    """Raised when the requested source image is not in puzzles-images/."""

    error_code = "image_not_found"


class UnsupportedImageFormatError(ExerciseServiceError):
    """Raised when a file exists but is not one of the accepted image formats."""

    error_code = "unsupported_image_format"


def source_images() -> list[Path]:
    """Return supported page photos in stable display order."""

    if not SOURCE_DIRECTORY.exists():
        return []
    # Sorting by lowercase file name keeps the browser order predictable across
    # operating systems and filesystems.
    return sorted(
        (path for path in SOURCE_DIRECTORY.iterdir() if is_supported_image(path)),
        key=lambda path: path.name.lower(),
    )


def is_supported_image(path: Path) -> bool:
    """Keep format checks in one place so API listing and processing agree."""

    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def validate_image_name(name: str) -> str:
    """Accept a single file name only, never nested or absolute paths."""

    clean_name = name.strip()
    if not clean_name or "/" in clean_name or "\\" in clean_name:
        raise InvalidImageNameError("Invalid image name.")
    return clean_name


def page_key(path: Path) -> str:
    """Build a cache folder name that changes when the source file changes."""

    # The stem alone is not enough: if IMG_1345.HEIC is replaced with a newer
    # file of the same name, mtime/size force a new generated-board folder.
    stat = path.stat()
    return f"{path.stem}-{stat.st_mtime_ns}-{stat.st_size}"


def cache_is_current(entry: dict[str, Any], source: Path) -> bool:
    """Return true only when cache metadata and generated board files match."""

    # This checks both metadata and the actual files. If someone deletes data/
    # manually, the stale JSON entry will not trick the app into showing broken
    # image URLs.
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


def process_page(source: Path) -> dict[str, Any]:
    """Create normalized board PNGs for one source photo and return cache data."""

    key = page_key(source)
    page_directory = BOARD_DIRECTORY / key
    page_directory.mkdir(parents=True, exist_ok=True)

    board_paths = []
    predictions = []
    # split_page returns OpenCV image arrays. Each board is written to disk so
    # the browser can load it later through /generated/<relative_path>.
    for index, board in enumerate(split_page(load_image(source)), start=1):
        relative_path = f"{key}/board-{index:02d}.png"
        board_path = BOARD_DIRECTORY / relative_path
        cv2.imwrite(str(board_path), board)
        board_paths.append(relative_path)

        # Recognition is optional; failed predictions still produce exercises
        # so the browser can show the crop and let the user edit the position.
        fen, recognition_status = recognize_fen(board_path)
        predictions.append({"fen": fen, "recognition_status": recognition_status})

    stat = source.stat()
    return {
        "mtime_ns": stat.st_mtime_ns,
        "page_key": key,
        "size": stat.st_size,
        "board_paths": board_paths,
        "predictions": predictions,
    }


def build_exercises(source: Path, entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert cache data into the JSON shape consumed by the frontend."""

    predictions = entry.get("predictions", [])
    exercises = []
    # The API deliberately sends simple strings/numbers. The browser should not
    # need to understand local filesystem paths or cache internals.
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


def process_single_image(name: str) -> list[dict[str, Any]]:
    """Crop and recognize one named source image, using cache when possible."""

    # Validate first, before touching the filesystem. This keeps API behavior
    # predictable and avoids path traversal through names like "../secret".
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
            # Slow path: crop boards and run optional recognition. Fast path:
            # use the existing cache entry and return immediately.
            entry = process_page(source)
            cache[clean_name] = entry
            CACHE.write(cache)

    return build_exercises(source, entry)


def clear_cache() -> None:
    """Delete generated board images and reset cache metadata."""

    with PROCESSING_LOCK:
        # Deleting data/ is safe because it only contains generated outputs.
        # Source photos live separately in puzzles-images/.
        if DATA_DIRECTORY.exists():
            shutil.rmtree(DATA_DIRECTORY)
        BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
        CACHE.write({})


def ensure_storage() -> None:
    """Create output folders required before serving generated files."""

    BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
