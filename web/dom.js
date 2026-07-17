/**
 * dom.js — Cached DOM element references.
 *
 * Instead of calling document.getElementById() every time we need an element,
 * this module collects all references once at startup.  This is the same idea
 * as ViewBinding in Android: look up each view once, store the reference, and
 * use it everywhere else.
 *
 * Because ES modules are deferred by default, the DOM is guaranteed to exist
 * when this code runs — there is no need for a DOMContentLoaded wrapper.
 */

export const dom = {
  // ── View containers ───────────────────────────────────────────────────────
  views: {
    images: document.getElementById("view-images"),
    puzzles: document.getElementById("view-puzzles"),
    board: document.getElementById("view-board"),
  },

  // ── Header ────────────────────────────────────────────────────────────────
  appTitle: document.getElementById("app-title"),
  appSubtitle: document.getElementById("app-subtitle"),
  languageEnglishButton: document.getElementById("language-en"),
  languageVietnameseButton: document.getElementById("language-vi"),

  // ── Image picker screen ───────────────────────────────────────────────────
  imageGrid: document.getElementById("image-grid"),
  imageMessage: document.getElementById("image-message"),

  // ── Puzzle grid screen ────────────────────────────────────────────────────
  puzzlePageName: document.getElementById("puzzle-page-name"),
  puzzleGrid: document.getElementById("puzzle-grid"),
  puzzleMessage: document.getElementById("puzzle-message"),

  // ── Board editor screen ───────────────────────────────────────────────────
  boardTitle: document.getElementById("board-title"),
  boardSourceImg: document.getElementById("board-source-img"),
  boardStatus: document.getElementById("board-status"),
  chessboard: document.getElementById("chessboard"),
  fenLabel: document.getElementById("fen-label"),
  fenCode: document.getElementById("fen-code"),
  palette: document.getElementById("palette"),
  editButton: document.getElementById("edit-board"),
  resetButton: document.getElementById("reset-board"),

  // ── Navigation buttons ────────────────────────────────────────────────────
  backToImagesButton: document.getElementById("back-to-images"),
  backToPuzzlesButton: document.getElementById("back-to-puzzles"),

  // ── Card templates (defined in index.html <template> elements) ────────────
  imageCardTemplate: document.getElementById("image-card-template"),
  puzzleCardTemplate: document.getElementById("puzzle-card-template"),
};
