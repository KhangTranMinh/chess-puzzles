/**
 * api.js — HTTP client for the backend REST API.
 *
 * This module wraps the browser fetch() API and turns error responses into
 * JavaScript Error objects that the UI can display directly.  It knows nothing
 * about DOM rendering — it only returns data or throws.
 *
 * Endpoints consumed:
 *   GET  /api/images                          → { images: [...] }
 *   POST /api/images/{name}/process           → { exercises: [...] }
 *   POST /api/cache/clear                     → { status: "cleared" }
 */

/**
 * Error subclass that carries the backend's error_code alongside the message.
 *
 * The error_code is a stable, language-independent string (e.g. "image_not_found")
 * that the i18n layer maps to a localised user message.
 */
export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * Fetch JSON from the given URL and throw on non-OK responses.
 *
 * The backend always returns a JSON body, even on errors, with an optional
 * "error" field and "error_code" field.  This helper unifies success and
 * failure paths so callers only need a try/catch.
 *
 * @param {string} url
 * @param {RequestInit} options — fetch options (method, body, etc.)
 * @returns {Promise<Object>} The parsed JSON response.
 * @throws {ApiError} If the response status is not 2xx or the body contains an error.
 */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new ApiError(data.error || `API returned ${response.status}`, data.error_code);
  }
  return data;
}

/**
 * API methods used by the frontend views.
 *
 * Each method returns a promise that resolves to the relevant data slice or
 * throws an ApiError with a localisable error code.
 */
export const api = {
  /** List all source images with their processed/unprocessed status. */
  async listImages() {
    const data = await fetchJson("/api/images");
    return data.images;
  },

  /** Process one source image: crop boards, run recognition, return exercises. */
  async processImage(name) {
    const data = await fetchJson(
      `/api/images/${encodeURIComponent(name)}/process`,
      { method: "POST" },
    );
    return data.exercises;
  },
};
