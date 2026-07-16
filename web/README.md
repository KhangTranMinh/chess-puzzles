# Web Notes

The root `README.md` is the main project guide. This file only covers frontend
details that matter when editing `web/`.

## No build step

There is no Node, Vite, React, or bundler here. The Python server serves these
files directly from `web/`:

- `index.html`
- `app.js`
- `styles.css`

After changing `app.js`, bump the query string in `index.html`, for example
from `/app.js?v=5` to `/app.js?v=6`, so the browser does not reuse an old cached
script.

## Localization checklist

Visible text belongs in `TRANSLATIONS` inside `app.js`.

When adding UI text:

1. Add the key to both `TRANSLATIONS.en` and `TRANSLATIONS.vi`.
2. Render it with `t("yourKey")`.
3. For values, use placeholders like `{number}` and call
   `t("puzzleNumber", { number: 3 })`.

Backend errors should be displayed from `error_code` via
`ERROR_TRANSLATION_KEYS`, not by parsing English error messages.
