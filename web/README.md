# Web Notes

The root `README.md` is the main project guide. This file only covers frontend
details that matter when editing `web/`.

## No build step

There is no Node, Vite, React, or bundler here. The Python server serves these
files directly from `web/`:

- `index.html`
- `app.js` (entry point — imports all other modules)
- `constants.js` (shared constants)
- `state.js` (mutable app and board state)
- `dom.js` (cached DOM element references)
- `i18n.js` (translations and language helpers)
- `api.js` (HTTP client for the backend)
- `board.js` (chessboard rendering and interaction)
- `views.js` (screen management and rendering)
- `styles.css`

## Module structure

The frontend uses native ES modules (`<script type="module">`). The dependency
graph has no cycles:

```
constants.js ←── state.js
     ↑              ↑
i18n.js ──────── dom.js
     ↑
api.js ─── board.js ─── views.js
                           ↑
                        app.js  (entry point)
```

- **constants.js** — Static values: piece definitions, board dimensions, view names.
- **state.js** — Two mutable objects: `appState` (navigation, language) and `boardState` (squares, edit mode).
- **dom.js** — All `getElementById` references collected once at startup.
- **i18n.js** — `TRANSLATIONS` dictionary, `t()` lookup, `localizedErrorMessage()`.
- **api.js** — `fetchJson()` wrapper, `api.listImages()`, `api.processImage()`.
- **board.js** — FEN conversion, square rendering, click handling, palette, edit mode.
- **views.js** — View switching, image/puzzle/board screen rendering, static text updates.
- **app.js** — Language switching, event listener wiring, initialisation.

## Localization checklist

Visible text belongs in `TRANSLATIONS` inside `i18n.js`.

When adding UI text:

1. Add the key to both `TRANSLATIONS.en` and `TRANSLATIONS.vi`.
2. Render it with `t("yourKey")`.
3. For values, use placeholders like `{number}` and call
   `t("puzzleNumber", { number: 3 })`.

Backend errors should be displayed from `error_code` via
`ERROR_TRANSLATION_KEYS`, not by parsing English error messages.
