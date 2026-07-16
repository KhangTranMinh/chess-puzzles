const EMPTY_FEN = "8/8/8/8/8/8/8/8";
const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
const PALETTE = Object.keys(PIECES);
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/* ── DOM refs ── */
const $viewImages  = document.getElementById("view-images");
const $viewPuzzles = document.getElementById("view-puzzles");
const $viewBoard   = document.getElementById("view-board");

const $imageGrid    = document.getElementById("image-grid");
const $imageMessage = document.getElementById("image-message");

const $puzzlePageName = document.getElementById("puzzle-page-name");
const $puzzleGrid     = document.getElementById("puzzle-grid");
const $puzzleMessage  = document.getElementById("puzzle-message");

const $boardTitle     = document.getElementById("board-title");
const $boardSourceImg = document.getElementById("board-source-img");
const $boardStatus    = document.getElementById("board-status");
const $chessboard     = document.getElementById("chessboard");
const $fenCode        = document.getElementById("fen-code");
const $palette        = document.getElementById("palette");

/* ── Navigation ── */
function showView(view) {
  $viewImages.hidden  = view !== "images";
  $viewPuzzles.hidden = view !== "puzzles";
  $viewBoard.hidden   = view !== "board";
}

/* ── FEN helpers ── */
function fromFen(fen) {
  const squares = Array(64).fill(null);
  (fen || EMPTY_FEN).split("/").forEach((rank, rankIndex) => {
    let file = 0;
    for (const ch of rank) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        squares[rankIndex * 8 + file] = `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`;
        file += 1;
      }
    }
  });
  return squares;
}

function toFen(squares) {
  return Array.from({ length: 8 }, (_, rank) => {
    let empty = 0, text = "";
    for (let file = 0; file < 8; file += 1) {
      const piece = squares[rank * 8 + file];
      if (!piece) empty += 1;
      else { if (empty) text += empty; empty = 0; text += piece[0] === "w" ? piece[1] : piece[1].toLowerCase(); }
    }
    return `${text}${empty || ""}`;
  }).join("/");
}

/* ── Board rendering (view 3) ── */
let boardSquares, boardSelected, boardPalettePiece;
const HOLDING_PALETTE = -1;
let editMode = false;

function renderBoard() {
  $chessboard.replaceChildren();
  boardSquares.forEach((piece, idx) => {
    const rank = Math.floor(idx / 8), file = idx % 8;
    const sq = document.createElement("button");
    sq.className = `square ${(rank + file) % 2 ? "dark" : "light"}${boardSelected === idx && boardSelected !== HOLDING_PALETTE ? " selected-square" : ""}${editMode ? " editing" : ""}`;
    sq.innerHTML =
      `${file === 0 ? `<small class="rank-label">${8 - rank}</small>` : ""}` +
      `${rank === 7 ? `<small class="file-label">${FILES[file]}</small>` : ""}` +
      `<span class="${piece && piece[0] === "w" ? "white-piece" : "black-piece" || ""}">${piece ? PIECES[piece] : ""}</span>`;
    sq.addEventListener("click", () => {
      if (editMode && boardSelected === HOLDING_PALETTE) {
        // Palette placement mode: drop piece on this square, stay in placement mode
        boardSquares[idx] = boardPalettePiece;
      } else if (boardSelected !== null) {
        // Move selected piece to this square (any square, empty or occupied)
        boardSquares[idx] = boardSquares[boardSelected];
        boardSquares[boardSelected] = null;
        boardSelected = null;
      } else if (boardSquares[idx]) {
        // Select this piece
        boardSelected = idx;
      }
      renderBoard();
    });
    $chessboard.append(sq);
  });
  $fenCode.textContent = `${toFen(boardSquares)} w - - 0 1`;
}

function initPalette() {
  $palette.replaceChildren();
  boardPalettePiece = "wK";
  PALETTE.forEach((piece) => {
    const btn = document.createElement("button");
    btn.textContent = PIECES[piece];
    btn.className = piece === boardPalettePiece ? "selected-piece" : "";
    btn.addEventListener("click", () => {
      boardPalettePiece = piece;
      boardSelected = HOLDING_PALETTE;
      [...$palette.children].forEach((c) => c.classList.toggle("selected-piece", c === btn));
      renderBoard();
    });
    $palette.append(btn);
  });
}

function updatePaletteState() {
  const palette = document.getElementById("palette");
  if (editMode) {
    palette.classList.remove("disabled");
  } else {
    palette.classList.add("disabled");
    boardSelected = null;
  }
}

/* ── View 1: Image list ── */
async function loadImageList() {
  $imageMessage.hidden = true;
  try {
    const res = await fetch("/api/images");
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const { images } = await res.json();
    $imageGrid.replaceChildren();
    if (!images.length) {
      $imageMessage.textContent = "No images found in puzzles-images/. Add some photos to get started!";
      $imageMessage.classList.remove("error");
      $imageMessage.hidden = false;
      return;
    }
    images.forEach((img) => {
      const card = document.getElementById("image-card-template").content.cloneNode(true);
      card.querySelector(".image-card-name").textContent = img.name;
      const badge = card.querySelector(".image-card-badge");
      badge.textContent = img.processed ? "Ready" : "Tap to process";
      badge.className = `image-card-badge ${img.processed ? "ready" : ""}`;
      card.querySelector(".image-card").addEventListener("click", () => openPuzzlePage(img.name));
      $imageGrid.append(card);
    });
  } catch (err) {
    $imageMessage.textContent = `Could not load images: ${err.message}`;
    $imageMessage.classList.add("error");
    $imageMessage.hidden = false;
  }
}

/* ── View 2: Puzzle grid for one image ── */
let currentImageName = null;
let currentExercises = [];

function openPuzzlePage(name) {
  currentImageName = name;
  $puzzlePageName.textContent = name;
  $puzzleMessage.hidden = true;
  $puzzleGrid.replaceChildren();
  showView("puzzles");
  loadPuzzles(name);
}

async function loadPuzzles(name) {
  // Show skeleton cards while loading
  for (let i = 0; i < 6; i += 1) {
    const card = document.createElement("div");
    card.className = "puzzle-card";
    card.innerHTML = `<div class="skeleton skeleton-img"></div><span class="puzzle-number">Puzzle ${i + 1}</span><span class="puzzle-fen-label">Processing…</span>`;
    $puzzleGrid.append(card);
  }

  try {
    const res = await fetch(`/api/images/${encodeURIComponent(name)}/process`, { method: "POST" });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Server error: ${res.status}`);

    currentExercises = data.exercises;
    $puzzleGrid.replaceChildren();
    data.exercises.forEach((ex) => {
      const card = document.getElementById("puzzle-card-template").content.cloneNode(true);
      card.querySelector("img").src = ex.image_url;
      card.querySelector("img").alt = `Puzzle ${ex.board_index}`;
      card.querySelector(".puzzle-number").textContent = `Puzzle ${ex.board_index}`;
      card.querySelector(".puzzle-fen-label").textContent = "";
      card.querySelector(".puzzle-card").addEventListener("click", () => openBoard(ex));
      $puzzleGrid.append(card);
    });
  } catch (err) {
    $puzzleGrid.replaceChildren();
    $puzzleMessage.textContent = `Failed to process image: ${err.message}`;
    $puzzleMessage.classList.add("error");
    $puzzleMessage.hidden = false;
  }
}

/* ── View 3: Single puzzle board ── */
function openBoard(exercise) {
  $boardTitle.textContent = `${currentImageName} · Puzzle ${exercise.board_index}`;
  $boardSourceImg.src = exercise.image_url;
  $boardSourceImg.alt = `Source diagram for puzzle ${exercise.board_index}`;
  $boardStatus.textContent = "";
  $boardStatus.className = "status-badge";

  const initial = fromFen(exercise.fen);
  boardSquares = [...initial];
  boardSelected = null;
  editMode = false;
  initPalette();
  updatePaletteState();
  renderBoard();

  const editBtn = document.getElementById("edit-board");
  editBtn.onclick = () => {
    if (!editMode) {
      // Enter edit mode: clear board, enable palette, button becomes Confirm
      boardSquares = Array(64).fill(null);
      boardSelected = null;
      editMode = true;
      updatePaletteState();
      editBtn.textContent = "Confirm";
      editBtn.classList.remove("quiet-button");
      renderBoard();
    } else {
      // Confirm: lock board, disable palette, button becomes Edit
      editMode = false;
      boardSelected = null;
      updatePaletteState();
      editBtn.textContent = "Edit";
      editBtn.classList.add("quiet-button");
      renderBoard();
    }
  };

  document.getElementById("reset-board").onclick = () => {
    boardSquares = [...initial];
    boardSelected = null;
    editMode = false;
    updatePaletteState();
    editBtn.textContent = "Edit";
    editBtn.classList.add("quiet-button");
    renderBoard();
  };

  showView("board");
}

/* ── Back navigation ── */
document.getElementById("back-to-images").addEventListener("click", () => {
  showView("images");
  loadImageList();
});
document.getElementById("back-to-puzzles").addEventListener("click", () => {
  showView("puzzles");
});

/* ── Start ── */
showView("images");
loadImageList();
