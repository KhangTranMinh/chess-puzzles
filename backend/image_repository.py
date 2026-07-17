"""Source image discovery, validation, and format checks.

This module owns everything related to the source photos the user places in
``puzzles-images/``.  It knows nothing about processing, caching, or HTTP —
it only answers questions like "which images exist?" and "is this filename safe?".
"""

from __future__ import annotations

from pathlib import Path


# ── Paths ────────────────────────────────────────────────────────────────────
# SOURCE_DIRECTORY is where the user places page photos.  It is allowed to be
# absent; the UI will simply show an empty state.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = PROJECT_ROOT / "puzzles-images"

# ── Supported formats ────────────────────────────────────────────────────────
# HEIC/HEIF are iPhone photo formats; Pillow + pillow-heif handles them.
IMAGE_EXTENSIONS = {".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"}


# ── Error hierarchy ──────────────────────────────────────────────────────────
# Each error carries a stable ``error_code`` that the frontend maps to a
# localised user message.  The English text is only a fallback for curl/testing.

class ImageRepositoryError(RuntimeError):
    """Base class for source-image validation errors."""

    error_code = "processing_failed"


class InvalidImageNameError(ImageRepositoryError):
    """Raised when a request tries to address a path instead of one image file."""

    error_code = "invalid_image_name"


class SourceImageNotFoundError(ImageRepositoryError):
    """Raised when the requested source image is not in puzzles-images/."""

    error_code = "image_not_found"


class UnsupportedImageFormatError(ImageRepositoryError):
    """Raised when a file exists but is not one of the accepted image formats."""

    error_code = "unsupported_image_format"


# ── Public helpers ───────────────────────────────────────────────────────────

def source_images() -> list[Path]:
    """Return supported page photos in stable display order.

    Sorting by lowercase file name keeps the browser order predictable across
    operating systems and filesystems.
    """

    if not SOURCE_DIRECTORY.exists():
        return []
    return sorted(
        (path for path in SOURCE_DIRECTORY.iterdir() if is_supported_image(path)),
        key=lambda path: path.name.lower(),
    )


def is_supported_image(path: Path) -> bool:
    """Return True if the file has a supported image extension.

    Centralised here so listing and processing always agree on what counts.
    """

    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def validate_image_name(name: str) -> str:
    """Accept a single file name only, never nested or absolute paths.

    Raises InvalidImageNameError if the name contains path separators or is empty.
    """

    clean_name = name.strip()
    if not clean_name or "/" in clean_name or "\\" in clean_name:
        raise InvalidImageNameError("Invalid image name.")
    return clean_name
