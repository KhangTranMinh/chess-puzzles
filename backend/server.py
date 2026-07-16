"""Dependency-light local web server for Chess Puzzle Viewer.

Run with ``python -m backend.server`` and open http://localhost:8000.
"""

from __future__ import annotations

import json
import mimetypes
import shutil
import threading
from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

import cv2

from backend.board_splitter import BoardDetectionError, load_image, split_page
from backend.cache import ExerciseCache
from backend.recognizer import recognize_fen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = PROJECT_ROOT / "puzzles-images"
DATA_DIRECTORY = PROJECT_ROOT / "data"
BOARD_DIRECTORY = DATA_DIRECTORY / "boards"
WEB_DIRECTORY = PROJECT_ROOT / "web"
CACHE = ExerciseCache(DATA_DIRECTORY / "cache.json")
IMAGE_EXTENSIONS = {".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"}
PROCESSING_LOCK = threading.Lock()


def source_images() -> list[Path]:
    if not SOURCE_DIRECTORY.exists():
        return []
    return sorted(
        (path for path in SOURCE_DIRECTORY.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS),
        key=lambda path: path.name.lower(),
    )


def page_key(path: Path) -> str:
    stat = path.stat()
    return f"{path.stem}-{stat.st_mtime_ns}-{stat.st_size}"


def cache_is_current(entry: dict, source: Path) -> bool:
    stat = source.stat()
    paths = entry.get("board_paths", [])
    return (
        entry.get("mtime_ns") == stat.st_mtime_ns
        and entry.get("size") == stat.st_size
        and len(paths) == 6
        and len(entry.get("predictions", [])) == 6
        and all((BOARD_DIRECTORY / path).is_file() for path in paths)
    )


def process_page(source: Path) -> dict:
    """Create six normalized PNGs for a source photo and cache their paths."""

    key = page_key(source)
    page_directory = BOARD_DIRECTORY / key
    page_directory.mkdir(parents=True, exist_ok=True)
    board_paths = []
    predictions = []
    for index, board in enumerate(split_page(load_image(source)), start=1):
        relative_path = f"{key}/board-{index:02d}.png"
        board_path = BOARD_DIRECTORY / relative_path
        cv2.imwrite(str(board_path), board)
        board_paths.append(relative_path)
        fen, recognition_status = recognize_fen(board_path)
        predictions.append({"fen": fen, "recognition_status": recognition_status})
    stat = source.stat()
    return {
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
        "board_paths": board_paths,
        "predictions": predictions,
    }


def exercises(refresh: bool = False) -> dict:
    """Return cached exercises, splitting only new or changed source images."""

    with PROCESSING_LOCK:
        cache = {} if refresh else CACHE.read()
        sources = source_images()
        cache = {name: entry for name, entry in cache.items() if name in {path.name for path in sources}}
        result, errors = [], []
        for source in sources:
            try:
                entry = cache.get(source.name, {})
                if refresh or not cache_is_current(entry, source):
                    entry = process_page(source)
                    cache[source.name] = entry
                predictions = entry.get("predictions", [])
                for index, board_path in enumerate(entry["board_paths"], start=1):
                    prediction = predictions[index - 1] if len(predictions) == 6 else {}
                    result.append({
                        "id": f"{source.stem}-{index}",
                        "source_image": source.name,
                        "board_index": index,
                        "image_url": f"/generated/{board_path}",
                        "fen": prediction.get("fen"),
                        "recognition_status": prediction.get("recognition_status", "recognizer_unavailable"),
                    })
            except BoardDetectionError as error:
                errors.append(f"{source.name}: {error}")
        CACHE.write(cache)
    return {"exercises": result, "errors": errors}


def safe_child(root: Path, request_path: str) -> Path | None:
    """Map a URL path to a file while preventing path traversal."""

    candidate = (root / unquote(request_path).lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


class RequestHandler(BaseHTTPRequestHandler):
    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"status": "ok"})
        elif path == "/api/exercises":
            self.send_json(exercises())
        elif path.startswith("/generated/"):
            target = safe_child(BOARD_DIRECTORY, path.removeprefix("/generated/"))
            if target is None:
                self.send_error(HTTPStatus.FORBIDDEN)
            else:
                self.send_file(target)
        else:
            relative_path = "index.html" if path == "/" else path.lstrip("/")
            target = safe_child(WEB_DIRECTORY, relative_path)
            if target is None:
                self.send_error(HTTPStatus.FORBIDDEN)
            else:
                self.send_file(target)

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/api/exercises/refresh":
            self.send_json(exercises(refresh=True))
        elif urlparse(self.path).path == "/api/cache/clear":
            with PROCESSING_LOCK:
                if DATA_DIRECTORY.exists():
                    shutil.rmtree(DATA_DIRECTORY)
                BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
            self.send_json({"status": "cleared"})
        else:
            self.send_error(HTTPStatus.NOT_FOUND)


def main() -> None:
    BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", 8000), RequestHandler)
    print("Chess Puzzle Viewer running at http://localhost:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
