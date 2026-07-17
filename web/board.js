/**
 * board.js — Chessboard rendering and interaction logic.
 *
 * This module owns everything related to the 8×8 editable board:
 *   - FEN ↔ square-array conversion
 *   - Square rendering and click handling
 *   - Edit mode, palette selection, and reset
 *
 * It depends on constants, state, dom, and i18n but has no dependency on
 * views or api — the board is a self-contained component.
 */

import { BOARD_SQUARE_COUNT, BOARD_WIDTH, EMPTY_FEN, FILES, PALETTE, PIECES } from "./constants.js";
import { appState, boardState } from "./state.js";
import { dom } from "./dom.js";
import { t } from "./i18n.js";

// ── FEN conversion ──────────────────────────────────────────────────────────
// FEN stores each rank as text.  Digits mean "this many empty squares"; letters
// mean pieces (uppercase = white, lowercase = black).  The two conversion
// functions below move between that compact text and a flat 64-item array.

/**
 * Parse a FEN position string into a 64-element square array.
 *
 * Index 0 = a8 (top-left), index 63 = h1 (bottom-right).  Each element is
 * null (empty) or a two-letter piece id like "wK" or "bP".
 *
 * @param {string|null} fen — A full or partial FEN string.
 * @returns {Array<string|null>} The board as a flat array.
 */
export function fromFen(fen) {
  const squares = Array(BOARD_SQUARE_COUNT).fill(null);
  const positionOnly = (fen || EMPTY_FEN).split(" ")[0];
  positionOnly.split("/").forEach((rank, rankIndex) => {
    let file = 0;
    for (const character of rank) {
      if (/\d/.test(character)) {
        file += Number(character);
      } else {
        const color = character === character.toUpperCase() ? "w" : "b";
        squares[rankIndex * BOARD_WIDTH + file] = `${color}${character.toUpperCase()}`;
        file += 1;
      }
    }
  });
  return squares;
}

/**
 * Convert a 64-element square array back into a FEN position string.
 *
 * Consecutive nulls are collapsed into digits.  Only the piece-placement part
 * is returned; boardFen() appends the fixed "w - - 0 1" suffix.
 */
export function toFen(squares) {
  const ranks = [];
  for (let rank = 0; rank < BOARD_WIDTH; rank += 1) {
    let emptyCount = 0;
    let rankText = "";
    for (let file = 0; file < BOARD_WIDTH; file += 1) {
      const piece = squares[rank * BOARD_WIDTH + file];
      if (!piece) {
        emptyCount += 1;
        continue;
      }
      if (emptyCount) {
        rankText += emptyCount;
        emptyCount = 0;
      }
      rankText += piece[0] === "w" ? piece[1] : piece[1].toLowerCase();
    }
    ranks.push(`${rankText}${emptyCount || ""}`);
  }
  return ranks.join("/");
}

/**
 * Build the full FEN string shown in the editor.
 *
 * The editor only controls piece placement.  The extra fields are fixed so the
 * output is a complete FEN that chess tools can paste/import.
 */
export function boardFen() {
  return `${toFen(boardState.squares)} w - - 0 1`;
}

// ── Edit mode ───────────────────────────────────────────────────────────────
// Edit mode activates the piece palette and lets the user place pieces.
// Entering/exiting is centralised here so the state, palette, and button label
// cannot drift apart.

/**
 * Toggle the board between edit mode (palette active) and normal mode.
 *
 * @param {boolean} enabled — true to enter edit mode, false to exit.
 */
export function setEditMode(enabled) {
  boardState.editMode = enabled;
  boardState.selectedSquare = null;
  boardState.placingFromPalette = false;

  dom.palette.classList.toggle("disabled", !enabled);
  dom.editButton.textContent = enabled ? t("confirm") : t("edit");
  dom.editButton.classList.toggle("quiet-button", !enabled);
}

/**
 * Reset the board to the position the recognizer predicted for this puzzle.
 *
 * This is "undo all edits", not "clear the board".
 */
export function resetBoardToInitial() {
  boardState.squares = [...boardState.initialSquares];
  setEditMode(false);
  renderBoard();
}

/**
 * Clear the board and enter edit mode for manual piece placement.
 *
 * The current UX treats Edit as "start from scratch".  If you later want
 * "edit the predicted board" instead, this is the one function to change —
 * swap the Array.fill(null) for a copy of boardState.initialSquares.
 */
export function clearBoardForManualEntry() {
  boardState.squares = Array(BOARD_SQUARE_COUNT).fill(null);
  setEditMode(true);
  renderBoard();
}

/**
 * Toggle between edit mode and normal mode.
 *
 * Called when the user clicks the Edit/Confirm button.
 */
export function toggleBoardEditMode() {
  if (boardState.editMode) {
    setEditMode(false);
    renderBoard();
  } else {
    clearBoardForManualEntry();
  }
}

// ── Palette ─────────────────────────────────────────────────────────────────
// The palette is the row of piece buttons below the board.  Selecting a piece
// puts the board into "click-to-drop" mode: every square click places that
// piece until the user picks a different piece or exits edit mode.

/**
 * Select a piece from the palette and enable click-to-drop placement.
 *
 * @param {string} piece — two-letter piece id, e.g. "bQ".
 */
export function selectPalettePiece(piece) {
  boardState.palettePiece = piece;
  boardState.selectedSquare = null;
  boardState.placingFromPalette = true;
  renderPalette();
  renderBoard();
}

// ── Square click handler ────────────────────────────────────────────────────
// The click behaviour depends on the current mode:
//   1. Edit + palette active  → place the selected palette piece
//   2. A square is selected   → move the picked-up piece here
//   3. Clicking a piece       → pick it up (select)

/**
 * Handle a click on one of the 64 board squares.
 *
 * @param {number} index — flat array index (0 = a8, 63 = h1).
 */
export function onSquareClick(index) {
  const clickedPiece = boardState.squares[index];

  if (boardState.editMode && boardState.placingFromPalette) {
    // Mode 1: drop the palette piece onto this square.
    boardState.squares[index] = boardState.palettePiece;
  } else if (boardState.selectedSquare !== null) {
    // Mode 2: move the previously selected piece to this square.
    boardState.squares[index] = boardState.squares[boardState.selectedSquare];
    boardState.squares[boardState.selectedSquare] = null;
    boardState.selectedSquare = null;
  } else if (clickedPiece) {
    // Mode 3: pick up the piece on this square.
    boardState.selectedSquare = index;
  }

  renderBoard();
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Rendering is intentionally simple: clear the board DOM and rebuild all 64
// square buttons from boardState.  For a board this small, that is easier to
// reason about than manually updating individual changed squares.

/**
 * Build the CSS class string for a single board square.
 *
 * Classes encode: colour (light/dark), selection highlight, and edit mode.
 */
function squareClassName(rank, file, index) {
  const colorClass = (rank + file) % 2 ? "dark" : "light";
  const selectedClass = boardState.selectedSquare === index ? " selected-square" : "";
  const editingClass = boardState.editMode ? " editing" : "";
  return `square ${colorClass}${selectedClass}${editingClass}`;
}

/**
 * Create the <button> element for one square, including rank/file labels.
 *
 * @param {string|null} piece — piece id or null for an empty square.
 * @param {number} index — flat array index.
 * @returns {HTMLButtonElement}
 */
function renderSquare(piece, index) {
  const rank = Math.floor(index / BOARD_WIDTH);
  const file = index % BOARD_WIDTH;
  const square = document.createElement("button");
  const pieceColorClass = piece ? (piece[0] === "w" ? "white-piece" : "black-piece") : "";

  square.type = "button";
  square.className = squareClassName(rank, file, index);
  square.setAttribute("role", "gridcell");
  square.innerHTML =
    `${file === 0 ? `<small class="rank-label">${BOARD_WIDTH - rank}</small>` : ""}` +
    `${rank === BOARD_WIDTH - 1 ? `<small class="file-label">${FILES[file]}</small>` : ""}` +
    `<span class="${pieceColorClass}">${piece ? PIECES[piece] : ""}</span>`;
  square.addEventListener("click", () => onSquareClick(index));
  return square;
}

/**
 * Rebuild the entire 8×8 board DOM from boardState.squares.
 *
 * Also updates the FEN display below the board.
 */
export function renderBoard() {
  dom.chessboard.replaceChildren();
  boardState.squares.forEach((piece, index) => {
    dom.chessboard.append(renderSquare(piece, index));
  });
  dom.fenCode.textContent = boardFen();
}

/**
 * Rebuild the palette row of piece buttons.
 *
 * The currently selected piece gets a highlight class.
 */
export function renderPalette() {
  dom.palette.replaceChildren();
  PALETTE.forEach((piece) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = PIECES[piece];
    button.className = piece === boardState.palettePiece ? "selected-piece" : "";
    button.addEventListener("click", () => selectPalettePiece(piece));
    dom.palette.append(button);
  });
}
