/**
 * constants.js — Shared constants used across all frontend modules.
 *
 * This file contains only static values with zero dependencies.  Every other
 * module imports from here instead of redefining the same magic numbers or
 * lookup tables.
 */

// ── Board geometry ──────────────────────────────────────────────────────────
// The FEN standard represents a chess position as eight ranks separated by "/".
// EMPTY_FEN is the starting point for a blank board.
export const EMPTY_FEN = "8/8/8/8/8/8/8/8";

// BOARD_SQUARE_COUNT and BOARD_WIDTH describe the 8×8 grid.  The square array
// is flat: index 0 is a8 (top-left), index 63 is h1 (bottom-right).
export const BOARD_SQUARE_COUNT = 64;
export const BOARD_WIDTH = 8;

// Every source photo is expected to contain exactly this many chess diagrams.
export const EXPECTED_PUZZLES_PER_IMAGE = 6;

// ── Piece identifiers ───────────────────────────────────────────────────────
// Internal piece ids combine colour letter + uppercase piece letter ("wK" =
// white king, "bP" = black pawn).  The Unicode symbols are for display only;
// the board state and FEN converters work entirely with the two-letter ids.
export const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

// PALETTE is the ordered list of piece ids shown in the editor toolbar.
export const PALETTE = Object.keys(PIECES);

// FILES maps column index 0–7 to the standard chess file letters a–h.
export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// ── View identifiers ────────────────────────────────────────────────────────
// The app has three screens.  Only one is visible at a time; showView() toggles
// the `hidden` attribute on each view element.
export const VIEWS = {
  IMAGES: "images",
  PUZZLES: "puzzles",
  BOARD: "board",
};

// ── Language defaults ───────────────────────────────────────────────────────
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "chess-puzzles-language";
