"""Optional pretrained chess-diagram recognition with safe FEN validation."""

from __future__ import annotations

from pathlib import Path


def canonical_fen(fen: str) -> str:
    """Validate a position-only FEN and collapse adjacent empty-square digits."""

    # FEN can include extra fields after the board position. This app only
    # needs the first field because the UI edits piece placement, not game state.
    ranks = fen.strip().split()[0].split("/")
    if len(ranks) != 8:
        raise ValueError("A FEN position must contain exactly eight ranks.")
    normalized_ranks = []
    for rank in ranks:
        width = 0
        empties = 0
        normalized = ""
        for character in rank:
            if character in "12345678":
                # Empty squares may arrive as separate digits. We accumulate
                # them and write one normalized digit later.
                width += int(character)
                empties += int(character)
            elif character in "prnbqkPRNBQK":
                if empties:
                    normalized += str(empties)
                    empties = 0
                width += 1
                normalized += character
            else:
                raise ValueError(f"Invalid FEN character: {character!r}")
        if empties:
            normalized += str(empties)
        if width != 8:
            raise ValueError("Each FEN rank must contain eight squares.")
        normalized_ranks.append(normalized)
    return "/".join(normalized_ranks)


def recognize_fen(board_path: Path) -> tuple[str | None, str]:
    """Predict a FEN from a cropped board, retaining manual mode on failure.

    Recognition remains non-fatal: a missing model, a failed download, or an
    uncertain model output must never prevent the source diagram reaching the
    review UI.
    """

    try:
        from chessimg2pos import predict_fen
    except ImportError:
        # The app still works without the optional recognizer dependency. The
        # browser will open an empty editable board instead.
        return None, "recognizer_unavailable"
    try:
        return canonical_fen(predict_fen(str(board_path))), "auto_predicted"
    except Exception:
        # Model errors should not block manual review. Returning a status lets
        # the frontend decide how much to explain to the user later.
        return None, "recognition_failed"
