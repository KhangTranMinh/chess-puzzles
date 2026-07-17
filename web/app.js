/**
 * app.js — Application entry point and event wiring.
 *
 * This is the only module that index.html loads directly.  It imports from all
 * other modules, sets up event listeners, restores saved state, and kicks off
 * the initial render.
 *
 * Module dependency graph (no cycles):
 *
 *   constants.js ←── state.js
 *        ↑              ↑
 *   i18n.js ────────── dom.js
 *        ↑
 *   api.js ─── board.js ─── views.js
 *                              ↑
 *                           app.js  (this file)
 */

import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from "./constants.js";
import { appState } from "./state.js";
import { dom } from "./dom.js";
import { TRANSLATIONS, readInitialLanguage } from "./i18n.js";
import {
  toggleBoardEditMode,
  resetBoardToInitial,
} from "./board.js";
import {
  showView,
  loadImageList,
  openPuzzlePage,
  updateStaticText,
  rerenderCurrentViewText,
} from "./views.js";

// ── Language switching ──────────────────────────────────────────────────────
// Changing language re-renders all visible translated text without re-fetching
// data.  The choice is persisted in localStorage so it survives refreshes.

/**
 * Switch the UI to a new language and re-render all translated text.
 *
 * @param {string} language — a language code, e.g. "en" or "vi".
 */
function setLanguage(language) {
  if (!TRANSLATIONS[language]) {
    return;
  }
  appState.language = language;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  rerenderCurrentViewText();
}

// ── Event listeners ─────────────────────────────────────────────────────────
// Each listener is wired once at startup.  The functions they call are imported
// from the appropriate module (board, views, or defined above).

dom.languageEnglishButton.addEventListener("click", () => setLanguage("en"));
dom.languageVietnameseButton.addEventListener("click", () => setLanguage("vi"));

dom.editButton.addEventListener("click", toggleBoardEditMode);
dom.resetButton.addEventListener("click", resetBoardToInitial);

dom.backToImagesButton.addEventListener("click", () => {
  showView("images");
  loadImageList();
});
dom.backToPuzzlesButton.addEventListener("click", () => showView("puzzles"));

// ── Initialisation ──────────────────────────────────────────────────────────
// Restore the saved language, render static labels, and load the image list.

appState.language = readInitialLanguage();
updateStaticText();
showView("images");
loadImageList();
