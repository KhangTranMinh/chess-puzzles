"""Board splitting, recognition, and saving pipeline.

This module orchestrates board_splitter and recognizer to turn one source
photo into six cropped board images with optional FEN predictions.  It owns
the processing lock (serialisation) and the page-key logic for cache folders.

It does NOT own cache reading/writing or API response building — those live
in exercise_service.py.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import cv2

from backend.board_splitter import load_image, split_page
from backend.recognizer import recognize_fen


# ── Constants ────────────────────────────────────────────────────────────────
EXPECTED_BOARDS_PER_IMAGE = 6

# ── Concurrency ──────────────────────────────────────────────────────────────
# The HTTP server can process multiple browser requests at the same time.
# Cropping and cache writes touch shared files, so serialize that section.
PROCESSING_LOCK = threading.Lock()


def page_key(path: Path) -> str:
    """Build a cache folder name that changes when the source file changes.

    The stem alone is not enough: if IMG_1345.HEIC is replaced with a newer
    file of the same name, mtime/size force a new generated-board folder.
    """

    stat = path.stat()
    return f"{path.stem}-{stat.st_mtime_ns}-{stat.st_size}"


def process_page(source: Path, board_directory: Path) -> dict[str, Any]:
    """Create normalized board PNGs for one source photo and return cache data.

    This is the slow path: it loads the photo, detects six boards, perspective-
    crops each one, saves PNGs, and runs optional FEN recognition.

    Args:
        source: Path to the source photo in puzzles-images/.
        board_directory: Root directory for generated board crops (data/boards/).

    Returns:
        A dict of metadata suitable for storing in the cache.
    """

    key = page_key(source)
    page_directory = board_directory / key
    page_directory.mkdir(parents=True, exist_ok=True)

    board_paths = []
    predictions = []
    for index, board in enumerate(split_page(load_image(source)), start=1):
        relative_path = f"{key}/board-{index:02d}.png"
        board_path = board_directory / relative_path
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
