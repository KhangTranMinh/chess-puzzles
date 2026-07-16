# Chess Puzzle Viewer

A local web app for photographed chess-exercise pages. It splits each page into
six diagrams, caches the crops, and provides a free-move chessboard for each
exercise.

The app makes an automatic FEN prediction with `chessimg2pos`, then renders it
on the editable board for review. Predictions remain editable because book
diagrams can still contain recognition errors.

## Run with Docker

Install Docker Desktop, then run:

```sh
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). Add or replace page photos
in `puzzles-images/`, then use **Refresh images** in the browser.

## Run without Docker

In one terminal:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m backend.server
```

Then open [http://localhost:8000](http://localhost:8000). Generated crop files
and their metadata live in `data/` and are rebuilt after source-image changes.

## Current scope

- HEIC/JPEG/PNG page input from `puzzles-images/`
- OpenCV splitting and perspective correction for six-board pages
- Pretrained FEN prediction with an editable review board
- Cached API at `GET /api/exercises` (served by the built-in Python web server)
- Editable, no-rules chessboards with side-to-move selector and reset
- Docker Compose development startup
