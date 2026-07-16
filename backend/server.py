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
        and entry.get("page_key") == page_key(source)
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
        "page_key": key,
        "size": stat.st_size,
        "board_paths": board_paths,
        "predictions": predictions,
    }


def _exercise_list(source: Path, entry: dict) -> list[dict]:
    predictions = entry.get("predictions", [])
    return [
        {
            "id": f"{source.stem}-{idx + 1}",
            "source_image": source.name,
            "board_index": idx + 1,
            "image_url": f"/generated/{board_path}",
            "fen": predictions[idx].get("fen") if idx < len(predictions) else None,
            "recognition_status": predictions[idx].get("recognition_status", "recognizer_unavailable") if idx < len(predictions) else "recognizer_unavailable",
        }
        for idx, board_path in enumerate(entry["board_paths"])
    ]


def process_single_image(name: str) -> dict:
    """Crop and recognize one named source image. Returns {exercises, error}."""
    source = SOURCE_DIRECTORY / name
    if not source.is_file():
        return {"exercises": [], "error": f"Image {name} not found."}
    if source.suffix.lower() not in IMAGE_EXTENSIONS:
        return {"exercises": [], "error": f"Unsupported image format: {source.suffix}"}

    with PROCESSING_LOCK:
        cache = CACHE.read()
        entry = cache.get(name, {})
        try:
            if not cache_is_current(entry, source):
                entry = process_page(source)
            cache[name] = entry
        except BoardDetectionError as error:
            return {"exercises": [], "error": str(error)}
        CACHE.write(cache)

    return {"exercises": _exercise_list(source, entry)}


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
        elif path == "/api/images":
            result = []
            cache = CACHE.read()
            for image_path in source_images():
                entry = cache.get(image_path.name, {})
                result.append({
                    "name": image_path.name,
                    "processed": cache_is_current(entry, image_path),
                })
            self.send_json({"images": result})
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
        req_path = urlparse(self.path).path
        if req_path == "/api/cache/clear":
            with PROCESSING_LOCK:
                if DATA_DIRECTORY.exists():
                    shutil.rmtree(DATA_DIRECTORY)
                BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
            CACHE.write({})
            self.send_json({"status": "cleared"})
        elif req_path.startswith("/api/images/") and req_path.endswith("/process"):
            parts = req_path.removeprefix("/api/images/").removesuffix("/process")
            name = unquote(parts).strip()
            if not name or "/" in name or "\\" in name:
                self.send_json({"exercises": [], "error": "Invalid image name."}, HTTPStatus.BAD_REQUEST)
                return
            data = process_single_image(name)
            if data.get("error"):
                if "not found" in data["error"]:
                    self.send_json(data, HTTPStatus.NOT_FOUND)
                else:
                    self.send_json(data, HTTPStatus.UNPROCESSABLE_ENTITY)
            else:
                self.send_json(data)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)


def main() -> None:
    BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", 8000), RequestHandler)
    print("Chess Puzzle Viewer running at http://localhost:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
