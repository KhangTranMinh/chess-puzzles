/**
 * views.js — View management and screen rendering.
 *
 * This module owns the three screens (image picker, puzzle grid, board editor)
 * and the functions that populate them with data.  It orchestrates api.js for
 * data fetching and board.js for the chessboard component.
 *
 * The entry points called by app.js are:
 *   - showView()           — switch which screen is visible
 *   - loadImageList()      — fetch and render the image picker
 *   - openPuzzlePage()     — navigate to the puzzle grid for one image
 *   - openBoard()          — navigate to the board editor for one puzzle
 *   - updateStaticText()   — refresh all translated labels
 *   - rerenderCurrentViewText() — refresh translated text without losing state
 */

import { EXPECTED_PUZZLES_PER_IMAGE, VIEWS } from "./constants.js";
import { appState, boardState } from "./state.js";
import { dom } from "./dom.js";
import { t, localizedErrorMessage } from "./i18n.js";
import { api } from "./api.js";
import {
  setEditMode,
  renderBoard,
  renderPalette,
  fromFen,
} from "./board.js";

// ── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Show one of the three view containers and hide the others.
 *
 * @param {string} viewName — one of the VIEWS constants ("images", "puzzles", "board").
 */
export function showView(viewName) {
  appState.activeView = viewName;
  Object.entries(dom.views).forEach(([name, element]) => {
    element.hidden = name !== viewName;
  });
}

/**
 * Display a message in a message element (image-message or puzzle-message).
 *
 * @param {HTMLElement} element — the message container.
 * @param {string} text — the message to show.
 * @param {boolean} isError — if true, adds the "error" CSS class.
 */
function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
  element.hidden = false;
}

/**
 * Hide and clear a message element.
 */
function hideMessage(element) {
  element.textContent = "";
  element.classList.remove("error");
  element.hidden = true;
}

/**
 * Deep-clone an HTML <template> element for use as a reusable card.
 *
 * @param {HTMLTemplateElement} template
 * @returns {DocumentFragment}
 */
function cloneTemplate(template) {
  return template.content.cloneNode(true);
}

// ── Image picker screen ─────────────────────────────────────────────────────

/**
 * Build one image card (thumbnail + name + status badge) from template.
 *
 * @param {Object} image — { name: string, processed: boolean }
 * @returns {DocumentFragment}
 */
function renderImageCard(image) {
  const card = cloneTemplate(dom.imageCardTemplate);
  const badge = card.querySelector(".image-card-badge");

  card.querySelector(".image-card-name").textContent = image.name;
  badge.textContent = image.processed ? t("ready") : t("tapToProcess");
  badge.className = `image-card-badge ${image.processed ? "ready" : ""}`;
  card.querySelector(".image-card").addEventListener("click", () => openPuzzlePage(image.name));
  return card;
}

/**
 * Rebuild the image grid from appState.images.
 */
function renderImageList() {
  dom.imageGrid.replaceChildren();
  appState.images.forEach((image) => dom.imageGrid.append(renderImageCard(image)));
}

/**
 * Fetch the list of source images and render the image picker.
 *
 * Shows a message if the list is empty or if the request fails.
 */
export async function loadImageList() {
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

// ── Puzzle grid screen ──────────────────────────────────────────────────────

/**
 * Show skeleton placeholder cards while the backend processes an image.
 */
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

/**
 * Build one puzzle card (cropped board image + label) from template.
 *
 * @param {Object} exercise — the exercise object from the API.
 * @returns {DocumentFragment}
 */
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

/**
 * Rebuild the puzzle grid from appState.currentExercises.
 */
function renderPuzzleGrid() {
  dom.puzzleGrid.replaceChildren();
  appState.currentExercises.forEach((exercise) => dom.puzzleGrid.append(renderPuzzleCard(exercise)));
}

/**
 * Process one source image and display the six puzzle cards.
 *
 * Shows skeleton placeholders during processing, then replaces them with the
 * actual cropped board images.  On failure, shows a localised error message.
 *
 * @param {string} name — the source image filename.
 */
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

/**
 * Navigate to the puzzle grid for a given source image.
 *
 * @param {string} name — the source image filename.
 */
export function openPuzzlePage(name) {
  appState.currentImageName = name;
  appState.currentExercises = [];
  appState.activeExercise = null;
  dom.puzzlePageName.textContent = name;
  showView(VIEWS.PUZZLES);
  loadPuzzles(name);
}

// ── Board editor screen ─────────────────────────────────────────────────────

/**
 * Update the board title and source image alt text.
 */
function renderBoardTitle() {
  if (!appState.activeExercise) {
    return;
  }
  dom.boardTitle.textContent = `${appState.currentImageName} · ${t("puzzleNumber", { number: appState.activeExercise.board_index })}`;
  dom.boardSourceImg.alt = t("sourceDiagramAlt", { number: appState.activeExercise.board_index });
}

/**
 * Open the board editor for a single puzzle.
 *
 * Loads the predicted FEN into the board, shows the cropped source diagram
 * alongside, and navigates to the board view.
 *
 * @param {Object} exercise — the exercise object from the API.
 */
export function openBoard(exercise) {
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

// ── Static text updates ─────────────────────────────────────────────────────
// These refresh all labels that exist once in index.html.  Card and board
// square text is rebuilt by their respective render functions instead.

/**
 * Update all static translated labels in the page.
 *
 * Called once at startup and again whenever the language changes.
 */
export function updateStaticText() {
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

/**
 * Re-render the current view's translated text without losing fetched data.
 *
 * When the user switches language, we do not re-fetch images or re-process
 * puzzles — we only rebuild the DOM that contains translated strings.
 */
export function rerenderCurrentViewText() {
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
