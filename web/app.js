const EMPTY_FEN = "8/8/8/8/8/8/8/8";
const BOARD_SQUARE_COUNT = 64;
const BOARD_WIDTH = 8;
const EXPECTED_PUZZLES_PER_IMAGE = 6;
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_STORAGE_KEY = "chess-puzzles-language";

// Internal piece ids use color + piece name. Example: "wK" means white king.
// The Unicode characters are only for display. The board state stores "wK",
// "bQ", etc. and the FEN helpers convert those ids to standard chess text.
const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
const PALETTE = Object.keys(PIECES);
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const VIEWS = {
  IMAGES: "images",
  PUZZLES: "puzzles",
  BOARD: "board",
};

// All text shown to the user lives here. This is the simplest localization
// approach for a small no-framework web app: code asks for t("some.key"), and
// the selected language decides the actual sentence.
const TRANSLATIONS = {
  en: {
    appTitle: "Chess Puzzles",
    appSubtitle: "Pick a photo to start solving!",
    languageEnglish: "English",
    languageVietnamese: "Tiếng Việt",
    back: "Back",
    reset: "Reset",
    edit: "Edit",
    confirm: "Confirm",
    ready: "Ready",
    tapToProcess: "Tap to process",
    noImages: "No images found in puzzles-images/. Add some photos to get started!",
    couldNotLoadImages: "Could not load images: {message}",
    processing: "Processing...",
    failedToProcess: "Failed to process image: {message}",
    puzzleNumber: "Puzzle {number}",
    sourceDiagramAlt: "Source diagram for puzzle {number}",
    puzzleCropAlt: "Puzzle {number}",
    editableBoardLabel: "Editable chess board",
    piecePaletteLabel: "Piece palette",
    unknownError: "Something went wrong.",
    invalidImageName: "Invalid image name.",
    imageNotFound: "Image not found.",
    unsupportedImageFormat: "Unsupported image format.",
    processingFailed: "Could not split this page into puzzles. Try a clearer photo.",
  },
  vi: {
    appTitle: "Bài Tập Cờ Vua",
    appSubtitle: "Chọn một ảnh để bắt đầu giải!",
    languageEnglish: "English",
    languageVietnamese: "Tiếng Việt",
    back: "Quay lại",
    reset: "Đặt lại",
    edit: "Sửa",
    confirm: "Xác nhận",
    ready: "Sẵn sàng",
    tapToProcess: "Bấm để xử lý",
    noImages: "Không tìm thấy ảnh trong puzzles-images/. Hãy thêm ảnh để bắt đầu.",
    couldNotLoadImages: "Không tải được danh sách ảnh: {message}",
    processing: "Đang xử lý...",
    failedToProcess: "Xử lý ảnh thất bại: {message}",
    puzzleNumber: "Bài {number}",
    sourceDiagramAlt: "Hình gốc của bài {number}",
    puzzleCropAlt: "Bài {number}",
    editableBoardLabel: "Bàn cờ có thể chỉnh sửa",
    piecePaletteLabel: "Bảng quân cờ",
    unknownError: "Có lỗi xảy ra.",
    invalidImageName: "Tên ảnh không hợp lệ.",
    imageNotFound: "Không tìm thấy ảnh.",
    unsupportedImageFormat: "Định dạng ảnh không được hỗ trợ.",
    processingFailed: "Không tách được trang này thành các bài cờ. Hãy thử ảnh rõ hơn.",
  },
};

const ERROR_TRANSLATION_KEYS = {
  invalid_image_name: "invalidImageName",
  image_not_found: "imageNotFound",
  unsupported_image_format: "unsupportedImageFormat",
  processing_failed: "processingFailed",
};

// Browser code talks to page elements through DOM references. This is similar
// to keeping ViewBinding fields together in Android instead of repeatedly
// calling findViewById all over the file.
const dom = {
  views: {
    images: document.getElementById("view-images"),
    puzzles: document.getElementById("view-puzzles"),
    board: document.getElementById("view-board"),
  },
  appTitle: document.getElementById("app-title"),
  appSubtitle: document.getElementById("app-subtitle"),
  languageEnglishButton: document.getElementById("language-en"),
  languageVietnameseButton: document.getElementById("language-vi"),
  imageGrid: document.getElementById("image-grid"),
  imageMessage: document.getElementById("image-message"),
  puzzlePageName: document.getElementById("puzzle-page-name"),
  puzzleGrid: document.getElementById("puzzle-grid"),
  puzzleMessage: document.getElementById("puzzle-message"),
  boardTitle: document.getElementById("board-title"),
  boardSourceImg: document.getElementById("board-source-img"),
  boardStatus: document.getElementById("board-status"),
  chessboard: document.getElementById("chessboard"),
  fenLabel: document.getElementById("fen-label"),
  fenCode: document.getElementById("fen-code"),
  palette: document.getElementById("palette"),
  editButton: document.getElementById("edit-board"),
  resetButton: document.getElementById("reset-board"),
  backToImagesButton: document.getElementById("back-to-images"),
  backToPuzzlesButton: document.getElementById("back-to-puzzles"),
  imageCardTemplate: document.getElementById("image-card-template"),
  puzzleCardTemplate: document.getElementById("puzzle-card-template"),
};

const appState = {
  language: readInitialLanguage(),
  activeView: VIEWS.IMAGES,
  images: [],
  currentImageName: null,
  currentExercises: [],
  activeExercise: null,
};

const boardState = {
  initialSquares: Array(BOARD_SQUARE_COUNT).fill(null),
  squares: Array(BOARD_SQUARE_COUNT).fill(null),
  selectedSquare: null,
  palettePiece: "wK",
  placingFromPalette: false,
  editMode: false,
};

class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function readInitialLanguage() {
  // localStorage is a tiny browser key-value store. It lets the language choice
  // survive refreshes without adding a backend database or user accounts.
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return TRANSLATIONS[storedLanguage] ? storedLanguage : DEFAULT_LANGUAGE;
}

function t(key, params = {}) {
  // Translation lookup with English fallback. The replace call handles small
  // variables like "{number}" without needing a full i18n library.
  const dictionary = TRANSLATIONS[appState.language] || TRANSLATIONS[DEFAULT_LANGUAGE];
  const fallbackDictionary = TRANSLATIONS[DEFAULT_LANGUAGE];
  const template = dictionary[key] || fallbackDictionary[key] || key;
  return template.replace(/\{(\w+)}/g, (_, name) => params[name] ?? "");
}

function localizedErrorMessage(error) {
  // The backend sends stable error_code values. If the code is known, translate
  // it. Otherwise show the raw server/client message so debugging is possible.
  const translationKey = ERROR_TRANSLATION_KEYS[error.code];
  if (translationKey) {
    return t(translationKey);
  }
  return error.message || t("unknownError");
}

function showView(viewName) {
  appState.activeView = viewName;
  Object.entries(dom.views).forEach(([name, element]) => {
    element.hidden = name !== viewName;
  });
}

function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
  element.hidden = false;
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.remove("error");
  element.hidden = true;
}

async function fetchJson(url, options = {}) {
  // fetch is the browser equivalent of an HTTP client call. It does not throw
  // on 404/500 by itself, so this helper turns API error payloads into
  // JavaScript Error objects that the screens can show to the user.
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new ApiError(data.error || `API returned ${response.status}`, data.error_code);
  }
  return data;
}

const api = {
  async listImages() {
    const data = await fetchJson("/api/images");
    return data.images;
  },
  async processImage(name) {
    const data = await fetchJson(`/api/images/${encodeURIComponent(name)}/process`, { method: "POST" });
    return data.exercises;
  },
};

function cloneTemplate(template) {
  // HTML <template> keeps reusable markup out of JavaScript strings. cloneNode
  // creates a fresh copy before we fill in text, images, and click handlers.
  return template.content.cloneNode(true);
}

function fromFen(fen) {
  // FEN stores each chess rank as text. Digits mean "this many empty squares";
  // letters mean pieces. This expands that compact text into a simple 64-item
  // array, ordered from top-left (a8) to bottom-right (h1).
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

function toFen(squares) {
  // Convert the board array back into FEN's compact rank strings by counting
  // consecutive empty squares and writing pieces as letters.
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

function boardFen() {
  // The editor only controls piece placement. The extra fields are fixed so
  // the output is a full FEN string that chess tools can paste/import.
  return `${toFen(boardState.squares)} w - - 0 1`;
}

function setEditMode(enabled) {
  // Entering/exiting edit mode is centralized here so the state, palette, and
  // button label cannot drift apart.
  boardState.editMode = enabled;
  boardState.selectedSquare = null;
  boardState.placingFromPalette = false;

  dom.palette.classList.toggle("disabled", !enabled);
  dom.editButton.textContent = enabled ? t("confirm") : t("edit");
  dom.editButton.classList.toggle("quiet-button", !enabled);
}

function resetBoardToInitial() {
  // Reset means "go back to what the recognizer/API provided for this puzzle",
  // not "clear the board".
  boardState.squares = [...boardState.initialSquares];
  setEditMode(false);
  renderBoard();
}

function clearBoardForManualEntry() {
  // The current UX treats Edit as manual entry from an empty board. If you later
  // want "edit the predicted board", this is the one function to change.
  boardState.squares = Array(BOARD_SQUARE_COUNT).fill(null);
  setEditMode(true);
  renderBoard();
}

function selectPalettePiece(piece) {
  // Selecting a palette piece puts the board into placement mode. Each square
  // click drops that piece and keeps the same palette selection active.
  boardState.palettePiece = piece;
  boardState.selectedSquare = null;
  boardState.placingFromPalette = true;
  renderPalette();
  renderBoard();
}

function onSquareClick(index) {
  const clickedPiece = boardState.squares[index];

  if (boardState.editMode && boardState.placingFromPalette) {
    boardState.squares[index] = boardState.palettePiece;
  } else if (boardState.selectedSquare !== null) {
    boardState.squares[index] = boardState.squares[boardState.selectedSquare];
    boardState.squares[boardState.selectedSquare] = null;
    boardState.selectedSquare = null;
  } else if (clickedPiece) {
    boardState.selectedSquare = index;
  }

  renderBoard();
}

function squareClassName(rank, file, index) {
  const colorClass = (rank + file) % 2 ? "dark" : "light";
  const selectedClass = boardState.selectedSquare === index ? " selected-square" : "";
  const editingClass = boardState.editMode ? " editing" : "";
  return `square ${colorClass}${selectedClass}${editingClass}`;
}

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

function renderBoard() {
  // Rendering is intentionally simple: clear the board DOM and rebuild all 64
  // square buttons from boardState. For a board this small, that is easier to
  // reason about than manually updating individual changed squares.
  dom.chessboard.replaceChildren();
  boardState.squares.forEach((piece, index) => {
    dom.chessboard.append(renderSquare(piece, index));
  });
  dom.fenCode.textContent = boardFen();
}

function renderPalette() {
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

function renderImageCard(image) {
  const card = cloneTemplate(dom.imageCardTemplate);
  const button = card.querySelector(".image-card");
  const badge = card.querySelector(".image-card-badge");

  card.querySelector(".image-card-name").textContent = image.name;
  badge.textContent = image.processed ? t("ready") : t("tapToProcess");
  badge.className = `image-card-badge ${image.processed ? "ready" : ""}`;
  button.addEventListener("click", () => openPuzzlePage(image.name));
  return card;
}

function renderImageList() {
  dom.imageGrid.replaceChildren();
  appState.images.forEach((image) => dom.imageGrid.append(renderImageCard(image)));
}

async function loadImageList() {
  hideMessage(dom.imageMessage);
  dom.imageGrid.replaceChildren();

  try {
    appState.images = await api.listImages();
    if (!appState.images.length) {
      showMessage(dom.imageMessage, t("noImages"));
      return;
    }
    renderImageList();
  } catch (error) {
    showMessage(dom.imageMessage, t("couldNotLoadImages", { message: localizedErrorMessage(error) }), true);
  }
}

function renderPuzzleSkeletons() {
  dom.puzzleGrid.replaceChildren();
  for (let index = 0; index < EXPECTED_PUZZLES_PER_IMAGE; index += 1) {
    const card = document.createElement("div");
    card.className = "puzzle-card";
    card.innerHTML =
      `<div class="skeleton skeleton-img"></div>` +
      `<span class="puzzle-number">${t("puzzleNumber", { number: index + 1 })}</span>` +
      `<span class="puzzle-fen-label">${t("processing")}</span>`;
    dom.puzzleGrid.append(card);
  }
}

function renderPuzzleCard(exercise) {
  const card = cloneTemplate(dom.puzzleCardTemplate);
  const image = card.querySelector("img");

  image.src = exercise.image_url;
  image.alt = t("puzzleCropAlt", { number: exercise.board_index });
  card.querySelector(".puzzle-number").textContent = t("puzzleNumber", { number: exercise.board_index });
  card.querySelector(".puzzle-fen-label").textContent = "";
  card.querySelector(".puzzle-card").addEventListener("click", () => openBoard(exercise));
  return card;
}

function renderPuzzleGrid() {
  dom.puzzleGrid.replaceChildren();
  appState.currentExercises.forEach((exercise) => dom.puzzleGrid.append(renderPuzzleCard(exercise)));
}

async function loadPuzzles(name) {
  hideMessage(dom.puzzleMessage);
  renderPuzzleSkeletons();

  try {
    appState.currentExercises = await api.processImage(name);
    renderPuzzleGrid();
  } catch (error) {
    appState.currentExercises = [];
    dom.puzzleGrid.replaceChildren();
    showMessage(dom.puzzleMessage, t("failedToProcess", { message: localizedErrorMessage(error) }), true);
  }
}

function openPuzzlePage(name) {
  appState.currentImageName = name;
  appState.currentExercises = [];
  appState.activeExercise = null;
  dom.puzzlePageName.textContent = name;
  showView(VIEWS.PUZZLES);
  loadPuzzles(name);
}

function renderBoardTitle() {
  if (!appState.activeExercise) {
    return;
  }
  dom.boardTitle.textContent = `${appState.currentImageName} · ${t("puzzleNumber", { number: appState.activeExercise.board_index })}`;
  dom.boardSourceImg.alt = t("sourceDiagramAlt", { number: appState.activeExercise.board_index });
}

function openBoard(exercise) {
  appState.activeExercise = exercise;
  dom.boardSourceImg.src = exercise.image_url;
  dom.boardStatus.textContent = "";
  dom.boardStatus.className = "status-badge";

  boardState.initialSquares = fromFen(exercise.fen);
  boardState.squares = [...boardState.initialSquares];
  boardState.palettePiece = "wK";
  setEditMode(false);
  renderBoardTitle();
  renderPalette();
  renderBoard();
  showView(VIEWS.BOARD);
}

function toggleBoardEditMode() {
  if (boardState.editMode) {
    setEditMode(false);
    renderBoard();
  } else {
    clearBoardForManualEntry();
  }
}

function updateStaticText() {
  // These are the labels that exist once in index.html. Cards and board squares
  // are recreated by their render functions instead.
  document.documentElement.lang = appState.language;
  dom.appTitle.textContent = t("appTitle");
  dom.appSubtitle.textContent = t("appSubtitle");
  dom.languageEnglishButton.textContent = t("languageEnglish");
  dom.languageVietnameseButton.textContent = t("languageVietnamese");
  dom.backToImagesButton.textContent = `← ${t("back")}`;
  dom.backToImagesButton.setAttribute("aria-label", t("back"));
  dom.backToPuzzlesButton.textContent = `← ${t("back")}`;
  dom.backToPuzzlesButton.setAttribute("aria-label", t("back"));
  dom.resetButton.textContent = t("reset");
  dom.editButton.textContent = boardState.editMode ? t("confirm") : t("edit");
  dom.chessboard.setAttribute("aria-label", t("editableBoardLabel"));
  dom.palette.setAttribute("aria-label", t("piecePaletteLabel"));
  dom.fenLabel.textContent = "FEN";
  dom.languageEnglishButton.classList.toggle("active", appState.language === "en");
  dom.languageVietnameseButton.classList.toggle("active", appState.language === "vi");
}

function rerenderCurrentViewText() {
  // Language changes should not lose state. We reuse already-fetched data and
  // only rebuild the DOM that contains translated text.
  updateStaticText();
  if (appState.activeView === VIEWS.IMAGES) {
    if (appState.images.length) {
      hideMessage(dom.imageMessage);
      renderImageList();
    } else {
      showMessage(dom.imageMessage, t("noImages"));
    }
  } else if (appState.activeView === VIEWS.PUZZLES) {
    dom.puzzlePageName.textContent = appState.currentImageName || "";
    if (appState.currentExercises.length) {
      renderPuzzleGrid();
    }
  } else if (appState.activeView === VIEWS.BOARD) {
    renderBoardTitle();
    setEditMode(boardState.editMode);
    renderBoard();
  }
}

function setLanguage(language) {
  if (!TRANSLATIONS[language]) {
    return;
  }
  appState.language = language;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  rerenderCurrentViewText();
}

dom.languageEnglishButton.addEventListener("click", () => setLanguage("en"));
dom.languageVietnameseButton.addEventListener("click", () => setLanguage("vi"));
dom.editButton.addEventListener("click", toggleBoardEditMode);
dom.resetButton.addEventListener("click", resetBoardToInitial);
dom.backToImagesButton.addEventListener("click", () => {
  showView(VIEWS.IMAGES);
  loadImageList();
});
dom.backToPuzzlesButton.addEventListener("click", () => showView(VIEWS.PUZZLES));

updateStaticText();
showView(VIEWS.IMAGES);
loadImageList();
