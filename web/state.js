/**
 * state.js — Mutable application and board state.
 *
 * This module owns the two global state objects that the rest of the app reads
 * and writes.  Keeping them in one place makes data flow easier to trace:
 * every module imports the same object reference, so mutations are visible
 * everywhere immediately.
 *
 * IMPORTANT: do NOT import from i18n, views, or board here — that would
 * create a circular dependency.  The language field is initialised to
 * DEFAULT_LANGUAGE; app.js overwrites it from localStorage before the first
 * render.
 */

import { BOARD_SQUARE_COUNT, DEFAULT_LANGUAGE } from "./constants.js";

/**
 * High-level application state: which view is active, the list of source
 * images, which image/puzzle is selected, and the UI language.
 */
export const appState = {
  language: DEFAULT_LANGUAGE,
  activeView: null,           // set by showView() on init
  images: [],                 // populated by loadImageList()
  currentImageName: null,     // set when opening the puzzle grid
  currentExercises: [],       // set after processing an image
  activeExercise: null,       // set when opening the board editor
};

/**
 * Board editor state: the 64-square array, selection, palette, and edit mode.
 *
 * - squares: the current position the user sees and edits.
 * - initialSquares: the recognizer's prediction, used by the Reset button.
 * - selectedSquare: index of the square the user clicked to pick up (null if none).
 * - palettePiece: which piece id the palette cursor is on.
 * - placingFromPalette: true while the user is in "click-to-drop" mode.
 * - editMode: true when the palette is active and the board accepts placements.
 */
export const boardState = {
  initialSquares: Array(BOARD_SQUARE_COUNT).fill(null),
  squares: Array(BOARD_SQUARE_COUNT).fill(null),
  selectedSquare: null,
  palettePiece: "wK",
  placingFromPalette: false,
  editMode: false,
};
