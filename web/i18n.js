/**
 * i18n.js — Internationalisation: translations and language helpers.
 *
 * All user-visible text lives in the TRANSLATIONS object.  The rest of the app
 * calls t("some.key") and the current language decides the actual sentence.
 *
 * Language selection is persisted in localStorage so it survives page refreshes.
 * The actual setLanguage() function (which also re-renders the current view)
 * lives in app.js to avoid a circular dependency with views.js.
 */

import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from "./constants.js";
import { appState } from "./state.js";

// ── Translation dictionaries ────────────────────────────────────────────────
// Keys are camelCase identifiers.  Values with {placeholders} are filled in
// at call time by the params argument to t().
export const TRANSLATIONS = {
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
    appSubtitle: "Chọn một ảnh để bắt đầu!",
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
    processingFailed: "Không tách được trang này thành các bài. Hãy thử ảnh rõ hơn.",
  },
};

// ── Error code → translation key mapping ────────────────────────────────────
// The backend sends stable error_code strings.  This map converts them into
// TRANSLATIONS keys so the frontend can show a localised message.
const ERROR_TRANSLATION_KEYS = {
  invalid_image_name: "invalidImageName",
  image_not_found: "imageNotFound",
  unsupported_image_format: "unsupportedImageFormat",
  processing_failed: "processingFailed",
};

// ── Public helpers ──────────────────────────────────────────────────────────

/**
 * Read the saved language from localStorage, falling back to DEFAULT_LANGUAGE
 * if the stored value is not a recognised language code.
 *
 * Called once at startup by app.js to initialise appState.language.
 */
export function readInitialLanguage() {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return TRANSLATIONS[stored] ? stored : DEFAULT_LANGUAGE;
}

/**
 * Look up a translation key for the current language.
 *
 * If the key is missing in the active language, English is tried as a fallback.
 * If it is missing there too, the raw key is returned so the developer can spot
 * the gap.
 *
 * @param {string} key   — camelCase translation key (e.g. "puzzleNumber").
 * @param {Object} params — placeholder values, e.g. { number: 3 }.
 * @returns {string} The translated, interpolated string.
 */
export function t(key, params = {}) {
  const dictionary = TRANSLATIONS[appState.language] || TRANSLATIONS[DEFAULT_LANGUAGE];
  const fallback = TRANSLATIONS[DEFAULT_LANGUAGE];
  const template = dictionary[key] || fallback[key] || key;
  return template.replace(/\{(\w+)}/g, (_, name) => params[name] ?? "");
}

/**
 * Turn an API error into a human-readable, localised message.
 *
 * If the error carries a known error_code, the translation is used.  Otherwise
 * the raw server or client message is shown so debugging is still possible.
 */
export function localizedErrorMessage(error) {
  const translationKey = ERROR_TRANSLATION_KEYS[error.code];
  if (translationKey) {
    return t(translationKey);
  }
  return error.message || t("unknownError");
}
