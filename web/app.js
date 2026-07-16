const EMPTY_FEN = "8/8/8/8/8/8/8/8";
const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♝", bN: "♞", bP: "♟",
};
const PALETTE = Object.keys(PIECES);
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function fromFen(fen = EMPTY_FEN) {
  const squares = Array(64).fill(null);
  // The API returns null until a recognition model has produced a trustworthy
  // FEN. In that case the editor must start empty, not try to call split() on null.
  (fen || EMPTY_FEN).split("/").forEach((rank, rankIndex) => {
    let file = 0;
    for (const character of rank) {
      if (/\d/.test(character)) file += Number(character);
      else {
        squares[rankIndex * 8 + file] = `${character === character.toUpperCase() ? "w" : "b"}${character.toUpperCase()}`;
        file += 1;
      }
    }
  });
  return squares;
}

function toFen(squares) {
  return Array.from({ length: 8 }, (_, rank) => {
    let empty = 0;
    let text = "";
    for (let file = 0; file < 8; file += 1) {
      const piece = squares[rank * 8 + file];
      if (!piece) empty += 1;
      else {
        if (empty) text += empty;
        empty = 0;
        text += piece[0] === "w" ? piece[1] : piece[1].toLowerCase();
      }
    }
    return `${text}${empty || ""}`;
  }).join("/");
}

function makeExercise(exercise) {
  const fragment = document.getElementById("exercise-template").content.cloneNode(true);
  const card = fragment.querySelector("article");
  const initial = fromFen(exercise.fen);
  let squares = [...initial];
  let selectedSquare = null;
  let palettePiece = "wK";
  const board = fragment.querySelector(".chessboard");
  const fen = fragment.querySelector("code");
  const sideToMove = fragment.querySelector(".side-to-move");

  fragment.querySelector(".source-name").textContent = `Puzzle ${exercise.board_index}`;
  fragment.querySelector("h2").textContent = `Exercise ${exercise.board_index}`;
  fragment.querySelector(".status").textContent = exercise.recognition_status === "auto_predicted" ? "AI prediction" : "Manual setup";
  const image = fragment.querySelector(".source-board");
  image.src = exercise.image_url;
  image.alt = `Source chess diagram for exercise ${exercise.board_index}`;

  function drawBoard() {
    board.replaceChildren();
    squares.forEach((piece, index) => {
      const rank = Math.floor(index / 8);
      const file = index % 8;
      const square = document.createElement("button");
      square.className = `square ${(rank + file) % 2 ? "dark" : "light"}${selectedSquare === index ? " selected-square" : ""}`;
      square.innerHTML = `${file === 0 ? `<small class="rank-label">${8 - rank}</small>` : ""}${rank === 7 ? `<small class="file-label">${FILES[file]}</small>` : ""}<span class="${piece?.startsWith("w") ? "white-piece" : "black-piece"}">${piece ? PIECES[piece] : ""}</span>`;
      square.addEventListener("click", () => {
        // No chess-rule validation: this is intentionally a free-position
        // editor, so photographed exercises can be reconstructed quickly.
        if (selectedSquare !== null) {
          squares[index] = squares[selectedSquare];
          squares[selectedSquare] = null;
          selectedSquare = null;
        } else if (squares[index]) selectedSquare = index;
        else squares[index] = palettePiece;
        drawBoard();
      });
      board.append(square);
    });
    fen.textContent = `${toFen(squares)} ${sideToMove.value} - - 0 1`;
  }

  const palette = fragment.querySelector(".palette");
  PALETTE.forEach((piece) => {
    const button = document.createElement("button");
    button.textContent = PIECES[piece];
    button.className = piece === palettePiece ? "selected-piece" : "";
    button.setAttribute("aria-label", `Place ${piece}`);
    button.addEventListener("click", () => {
      palettePiece = piece;
      selectedSquare = null;
      [...palette.children].forEach((item) => item.classList.toggle("selected-piece", item === button));
      drawBoard();
    });
    palette.append(button);
  });
  fragment.querySelector(".reset").addEventListener("click", () => { squares = [...initial]; selectedSquare = null; drawBoard(); });
  fragment.querySelector(".clear").addEventListener("click", () => { squares = Array(64).fill(null); selectedSquare = null; drawBoard(); });
  sideToMove.addEventListener("change", drawBoard);
  drawBoard();
  return fragment;
}

async function load(refresh = false) {
  const message = document.getElementById("message");
  const refreshButton = document.getElementById("refresh");
  refreshButton.disabled = true;
  refreshButton.textContent = "Processing…";
  message.hidden = true;
  try {
    const response = await fetch(refresh ? "/api/exercises/refresh" : "/api/exercises", { method: refresh ? "POST" : "GET" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    const grid = document.getElementById("exercise-grid");
    const pages = data.exercises.reduce((grouped, exercise) => {
      (grouped[exercise.source_image] ||= []).push(exercise);
      return grouped;
    }, {});
    const pageCards = Object.entries(pages).map(([sourceImage, pageExercises]) => {
      const page = document.getElementById("page-template").content.cloneNode(true);
      page.querySelector(".page-source").textContent = sourceImage;
      page.querySelector(".page-count").textContent = `${pageExercises.length} puzzles`;
      page.querySelector(".puzzle-grid").append(...pageExercises.map(makeExercise));
      return page;
    });
    grid.replaceChildren(...pageCards);
    // Keep the page from auto-focusing any puzzle card or board after render.
    const activeElement = document.activeElement;
    if (activeElement && grid.contains(activeElement) && typeof activeElement.blur === "function") {
      activeElement.blur();
    }
    if (data.errors.length) {
      message.textContent = data.errors.join(" ");
      message.classList.add("error");
      message.hidden = false;
    } else if (!data.exercises.length) {
      message.textContent = "No supported images found in puzzles-images/.";
      message.hidden = false;
    }
  } catch (error) {
    message.textContent = `Unable to load exercises: ${error.message}`;
    message.classList.add("error");
    message.hidden = false;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh images";
  }
}

document.getElementById("refresh").addEventListener("click", () => load(true));
load();
