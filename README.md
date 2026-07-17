# Chess Puzzle Viewer

A local web app for photographed chess-exercise pages.

You put page photos in `puzzles-images/`. The backend finds the six chess
diagrams on each page, saves cropped board images in `data/boards/`, optionally
predicts a FEN position, and the browser shows editable puzzles.

## How to run

### Option 1: Docker

Install Docker Desktop, then run:

```sh
docker compose up --build
```

Open:

```text
http://localhost:8000
```

### Option 2: Python directly

Create a virtual environment and install dependencies:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

Start the local server:

```sh
.venv/bin/python -m backend.server
```

Open:

```text
http://localhost:8000
```

## Project components

```text
backend/
  server.py             HTTP server. Handles URLs, JSON responses, and static files.
  exercise_service.py   App logic. Lists images, uses cache, crops boards, builds API data.
  board_splitter.py     OpenCV image processing. Detects six boards and perspective-crops them.
  recognizer.py         Optional chess image to FEN prediction wrapper.
  cache.py              Small JSON file cache helper.
  requirements.txt      Python dependencies.

web/
  index.html            Page structure and reusable HTML templates.
  app.js                Entry point. Wires events and initialises the app.
  constants.js          Shared constants (piece definitions, board dimensions).
  state.js              Mutable app and board state objects.
  dom.js                Cached DOM element references.
  i18n.js               Translations and language helpers.
  api.js                HTTP client for the backend REST API.
  board.js              Chessboard rendering, FEN conversion, edit mode.
  views.js              View management and screen rendering.
  styles.css            Visual styling and responsive layout.

puzzles-images/         Your source page photos. HEIC/JPG/PNG/WebP are supported.
data/                   Generated output. Safe to delete; it will be rebuilt.
docker-compose.yml      Docker startup config.
```

## How the app works

1. The browser opens `web/index.html` from the Python server.
2. `web/app.js` calls `GET /api/images`.
3. `backend/server.py` receives the request and calls `image_summaries()` in
   `backend/exercise_service.py`.
4. When you pick an image, the browser calls
   `POST /api/images/<image-name>/process`.
5. `exercise_service.py` checks the JSON cache. If the image is already
   processed and unchanged, it reuses the old board crops.
6. If the image is new or changed, `board_splitter.py` loads the photo, finds
   six chess boards, and saves one PNG per board under `data/boards/`.
7. `recognizer.py` tries to predict the board position as FEN. If recognition
   fails, the puzzle still opens so you can enter pieces manually.
8. The browser renders the cropped image and editable chessboard.

## Localization

The app supports English and Vietnamese in `web/i18n.js`.

All visible browser text is stored in the `TRANSLATIONS` object. The helper
function `t("key")` returns the text for the active language.

Backend errors include an `error_code`, for example:

```json
{
  "exercises": [],
  "error": "Invalid image name.",
  "error_code": "invalid_image_name"
}
```

The browser translates `error_code` instead of parsing English text.

## Important terms

**Backend**: Python code that runs on your computer and serves data/files to the
browser. In this project, it lives in `backend/`.

**Frontend / Web app**: HTML, CSS, and JavaScript running in the browser. In
this project, it lives in `web/`.

**HTTP server**: Code that listens at `http://localhost:8000` and responds to
browser requests.

**API**: URL endpoints that return data instead of a visual page. Examples:
`GET /api/images` and `POST /api/images/<name>/process`.

**Static file**: A file sent directly to the browser, such as `index.html`,
`app.js`, `styles.css`, or generated board PNGs.

**DOM**: The browser's tree of HTML elements. JavaScript changes the DOM to show
images, messages, buttons, and board squares.

**Template**: Reusable HTML inside `<template>`. JavaScript clones it to create
image cards and puzzle cards.

**FEN**: Forsyth-Edwards Notation, a compact text format for a chess position.
Example empty board: `8/8/8/8/8/8/8/8`.

**OpenCV**: Image-processing library used by `board_splitter.py` to find board
edges and crop each board.

**Perspective crop**: Transforming a photographed, tilted board into a flat
square image.

**Cache**: Saved metadata in `data/cache.json`. It avoids reprocessing the same
photo every time.

**HEIC**: iPhone photo format. The backend uses Pillow plus `pillow-heif` so
HEIC images can be loaded.

## Generated files

`data/` is generated and can be deleted. The next process request rebuilds it.

Do not put source photos in `data/`. Put them in `puzzles-images/`.

## Development notes

- `backend/server.py` should stay focused on HTTP details.
- `backend/exercise_service.py` should own app behavior and cache rules.
- The frontend is split into ES modules. See `web/README.md` for the dependency graph.
- `web/i18n.js` owns translations. `web/board.js` owns the chessboard. `web/views.js` owns screen rendering.
- If you add new visible text, add it to both `TRANSLATIONS.en` and
  `TRANSLATIONS.vi` in `web/i18n.js`.
- If you add a new backend error, give it an `error_code` and map it in
  `ERROR_TRANSLATION_KEYS` in `web/i18n.js`.
