"""Split a photographed chess-exercise page into six normalized board images.

Run from the repository root:

    python backend/board_splitter.py puzzles-images/IMG_1345.HEIC output/page-55

The command writes ``board-01.png`` through ``board-06.png`` and a
``detected-boards.jpg`` diagnostic image.  It intentionally fails rather than
silently returning the wrong number of boards: incorrect crops would make any
subsequent FEN recognition unreliable.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image
from pillow_heif import register_heif_opener

# Register HEIF/HEIC support once at import time.  The call is idempotent, but
# guarding with a flag makes the intent clear: this is a one-time setup step.
_heif_registered = False


EXPECTED_BOARD_COUNT = 6
DEFAULT_BOARD_SIZE = 800


class BoardDetectionError(RuntimeError):
    """Raised when the page cannot be safely split into exactly six boards."""


@dataclass(frozen=True)
class BoardCandidate:
    """A possible board boundary, represented by four clockwise image points."""

    corners: np.ndarray
    score: float


def load_image(path: Path) -> np.ndarray:
    """Load common image formats and HEIC photos as a BGR OpenCV image."""

    global _heif_registered
    # OpenCV builds often omit HEIC support.  Pillow + pillow-heif makes the
    # source format irrelevant while retaining the original photograph pixels.
    if not _heif_registered:
        register_heif_opener()
        _heif_registered = True
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def order_corners(points: np.ndarray) -> np.ndarray:
    """Return four points in top-left, top-right, bottom-right, bottom-left order."""

    points = points.astype(np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).ravel()
    return np.array(
        [
            points[np.argmin(sums)],
            points[np.argmin(differences)],
            points[np.argmax(sums)],
            points[np.argmax(differences)],
        ],
        dtype=np.float32,
    )


def polygon_iou(left: np.ndarray, right: np.ndarray) -> float:
    """Approximate overlap of two candidates with their axis-aligned bounding boxes."""

    left_x, left_y, left_w, left_h = cv2.boundingRect(left.astype(np.float32))
    right_x, right_y, right_w, right_h = cv2.boundingRect(right.astype(np.float32))
    x1, y1 = max(left_x, right_x), max(left_y, right_y)
    x2, y2 = min(left_x + left_w, right_x + right_w), min(left_y + left_h, right_y + right_h)
    overlap = max(0, x2 - x1) * max(0, y2 - y1)
    union = left_w * left_h + right_w * right_h - overlap
    return overlap / union if union else 0.0


def candidate_score(corners: np.ndarray, image_area: int) -> float | None:
    """Score a convex, approximately square contour; reject implausible sizes."""

    contour_area = cv2.contourArea(corners)
    if not image_area * 0.004 <= contour_area <= image_area * 0.20:
        return None

    sides = [
        np.linalg.norm(corners[index] - corners[(index + 1) % 4])
        for index in range(4)
    ]
    shortest, longest = min(sides), max(sides)
    if shortest < 40 or longest / shortest > 1.35:
        return None

    # A valid board has four similar sides.  Prefer the largest such contour:
    # this suppresses individual 8x8 cells and small decorative rectangles.
    squareness = shortest / longest
    return contour_area * squareness


def find_board_candidates(image: np.ndarray) -> list[BoardCandidate]:
    """Detect large square contours likely to be the outer border of a board."""

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    normalized = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(normalized, (5, 5), 0)
    edges = cv2.Canny(blurred, 45, 135)

    # Board borders can be interrupted by glare or page curvature.  Joining
    # short nearby edge segments makes the outside square a closed contour
    # without merging the two clearly separated columns of diagrams.
    edges = cv2.morphologyEx(
        edges,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)),
        iterations=2,
    )
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    image_area = image.shape[0] * image.shape[1]
    candidates: list[BoardCandidate] = []

    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        approximation = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approximation) != 4 or not cv2.isContourConvex(approximation):
            continue
        corners = order_corners(approximation.reshape(4, 2))
        score = candidate_score(corners, image_area)
        if score is not None:
            candidates.append(BoardCandidate(corners, score))

    # Each printed border commonly produces inner and outer contours.  Keep the
    # best one only; the resulting list should contain one candidate per board.
    deduplicated: list[BoardCandidate] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        if all(polygon_iou(candidate.corners, kept.corners) < 0.60 for kept in deduplicated):
            deduplicated.append(candidate)
    return deduplicated


def sort_reading_order(candidates: Iterable[BoardCandidate]) -> list[BoardCandidate]:
    """Sort the six diagrams left-to-right, then top-to-bottom."""

    rows = group_rows(candidates)
    return [candidate for row in rows for candidate, _ in sorted(row, key=lambda item: item[1][0])]


def group_rows(candidates: Iterable[BoardCandidate]) -> list[list[tuple[BoardCandidate, np.ndarray]]]:
    """Group candidate centers into the three printed rows on the page."""

    candidates = list(candidates)
    centers = np.array([candidate.corners.mean(axis=0) for candidate in candidates])
    row_tolerance = np.median(
        [np.linalg.norm(candidate.corners[0] - candidate.corners[1]) for candidate in candidates]
    ) * 0.55
    rows: list[list[tuple[BoardCandidate, np.ndarray]]] = []
    for candidate, center in sorted(zip(candidates, centers), key=lambda item: item[1][1]):
        if not rows or abs(center[1] - np.mean([item[1][1] for item in rows[-1]])) > row_tolerance:
            rows.append([])
        rows[-1].append((candidate, center))
    return rows


def complete_candidate_grid(candidates: list[BoardCandidate]) -> list[BoardCandidate]:
    """Recover one missed board only when the other five prove a 2-by-3 layout."""

    if len(candidates) == EXPECTED_BOARD_COUNT:
        return sort_reading_order(candidates)
    if len(candidates) != EXPECTED_BOARD_COUNT - 1:
        raise BoardDetectionError(
            f"Expected {EXPECTED_BOARD_COUNT} board borders, detected {len(candidates)}. "
            "Use the diagnostic image to adjust the photo or detection parameters."
        )

    rows = group_rows(candidates)
    if len(rows) != 3 or sorted(len(row) for row in rows) != [1, 2, 2]:
        raise BoardDetectionError(
            "Detected five borders, but they do not form an unambiguous 2-by-3 board layout."
        )
    missing_row_index = next(index for index, row in enumerate(rows) if len(row) == 1)
    if missing_row_index != 1:
        raise BoardDetectionError("The missing board is not in the middle row; automatic recovery is unsafe.")

    lone_candidate, lone_center = rows[missing_row_index][0]
    top_row = sorted(rows[0], key=lambda item: item[1][0])
    bottom_row = sorted(rows[2], key=lambda item: item[1][0])
    left_column_x = np.mean([top_row[0][1][0], bottom_row[0][1][0]])
    right_column_x = np.mean([top_row[1][1][0], bottom_row[1][1][0]])
    missing_on_left = abs(lone_center[0] - right_column_x) < abs(lone_center[0] - left_column_x)
    column_index = 0 if missing_on_left else 1
    top_candidate, top_center = top_row[column_index]
    bottom_candidate, bottom_center = bottom_row[column_index]

    # This fallback is deliberately narrow.  The adjacent column tells us the
    # middle-row height, while the board above and below provide the matching
    # column's perspective.  Interpolating all four corners preserves the page
    # skew far better than using a simple axis-aligned rectangle.
    adjacent_top_center = top_row[1 - column_index][1]
    adjacent_bottom_center = bottom_row[1 - column_index][1]
    interpolation = (lone_center[1] - adjacent_top_center[1]) / (
        adjacent_bottom_center[1] - adjacent_top_center[1]
    )
    if not 0.2 < interpolation < 0.8:
        raise BoardDetectionError("The missing board's inferred row position is implausible.")
    inferred_corners = top_candidate.corners + interpolation * (
        bottom_candidate.corners - top_candidate.corners
    )
    inferred = BoardCandidate(order_corners(inferred_corners), min(top_candidate.score, bottom_candidate.score))
    return sort_reading_order([*candidates, inferred])


def warp_board(image: np.ndarray, corners: np.ndarray, size: int) -> np.ndarray:
    """Perspective-correct a detected board into a square image."""

    destination = np.array(
        [[0, 0], [size - 1, 0], [size - 1, size - 1], [0, size - 1]], dtype=np.float32
    )
    transform = cv2.getPerspectiveTransform(corners.astype(np.float32), destination)
    return cv2.warpPerspective(image, transform, (size, size), flags=cv2.INTER_CUBIC)


def split_page(image: np.ndarray, board_size: int = DEFAULT_BOARD_SIZE) -> list[np.ndarray]:
    """Return six perspective-corrected board images or raise a clear error."""

    ordered = complete_candidate_grid(find_board_candidates(image))
    return [warp_board(image, candidate.corners, board_size) for candidate in ordered]


def save_diagnostic(image: np.ndarray, candidates: Iterable[BoardCandidate], path: Path) -> None:
    """Save the selected contours and their reading-order numbers for inspection."""

    diagnostic = image.copy()
    for index, candidate in enumerate(sort_reading_order(candidates), start=1):
        corners = candidate.corners.astype(np.int32)
        cv2.polylines(diagnostic, [corners], True, (0, 0, 255), 8)
        center = tuple(corners.mean(axis=0).astype(int))
        cv2.putText(diagnostic, str(index), center, cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 5)
    cv2.imwrite(str(path), diagnostic)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path, help="Photograph containing exactly six chess boards")
    parser.add_argument("output_dir", type=Path, help="Directory for normalized board PNGs")
    parser.add_argument("--size", type=int, default=DEFAULT_BOARD_SIZE, help="Output square size in pixels")
    arguments = parser.parse_args()

    image = load_image(arguments.image)
    candidates = complete_candidate_grid(find_board_candidates(image))
    arguments.output_dir.mkdir(parents=True, exist_ok=True)
    save_diagnostic(image, candidates, arguments.output_dir / "detected-boards.jpg")
    boards = split_page(image, arguments.size)
    for index, board in enumerate(boards, start=1):
        cv2.imwrite(str(arguments.output_dir / f"board-{index:02d}.png"), board)
    print(f"Wrote {len(boards)} normalized boards to {arguments.output_dir}")


if __name__ == "__main__":
    main()
