"""Dependency-light local web server for Chess Puzzle Viewer.

Run with ``python -m backend.server`` and open http://localhost:8000.
"""

from __future__ import annotations

import json
import mimetypes
from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

from backend.board_splitter import BoardDetectionError
from backend.exercise_service import (
    BOARD_DIRECTORY,
    InvalidImageNameError,
    SourceImageNotFoundError,
    UnsupportedImageFormatError,
    clear_cache,
    ensure_storage,
    image_summaries,
    process_single_image,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_DIRECTORY = PROJECT_ROOT / "web"


def error_payload(error: Exception, fallback_code: str) -> dict:
    """Build a consistent API error body.

    The browser displays localized messages, so ``error_code`` is the important
    machine-readable field.  ``error`` remains useful when testing the API with
    curl or when the frontend does not yet have a translation for a new error.
    """

    return {
        "exercises": [],
        "error": str(error),
        "error_code": getattr(error, "error_code", fallback_code),
    }


def safe_child(root: Path, request_path: str) -> Path | None:
    """Map a URL path to a file while preventing path traversal."""

    # URL paths are plain strings from the browser. Resolving them against the
    # allowed root and then checking relative_to prevents requests like
    # /generated/../../.env from reading files outside the intended folder.
    candidate = (root / unquote(request_path).lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


class RequestHandler(BaseHTTPRequestHandler):
    """Translate HTTP requests into service calls and static file responses."""

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        # BaseHTTPRequestHandler is lower-level than Flask/FastAPI: we manually
        # serialize the body and set HTTP headers before writing bytes.
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path) -> None:
        # This serves both generated board PNGs and static frontend files
        # (index.html, app.js, styles.css). There is no separate web server.
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
        # The method name is required by Python's HTTP server. It is like an
        # Android callback: the framework calls do_GET when a GET request arrives.
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"status": "ok"})
        elif path == "/api/images":
            self.send_json({"images": image_summaries()})
        elif path.startswith("/generated/"):
            target = safe_child(BOARD_DIRECTORY, path.removeprefix("/generated/"))
            if target is None:
                self.send_error(HTTPStatus.FORBIDDEN)
            else:
                self.send_file(target)
        else:
            # Any non-API path falls back to files in web/. "/" maps to
            # index.html so http://localhost:8000 opens the app.
            relative_path = "index.html" if path == "/" else path.lstrip("/")
            target = safe_child(WEB_DIRECTORY, relative_path)
            if target is None:
                self.send_error(HTTPStatus.FORBIDDEN)
            else:
                self.send_file(target)

    def do_POST(self) -> None:  # noqa: N802
        # POST routes change local generated data: clearing the cache or
        # processing one source photo into cropped puzzle images.
        req_path = urlparse(self.path).path
        if req_path == "/api/cache/clear":
            clear_cache()
            self.send_json({"status": "cleared"})
        elif req_path.startswith("/api/images/") and req_path.endswith("/process"):
            # The image file name lives in the URL path. Decode it before
            # handing it to the service, but keep validation inside the service.
            parts = req_path.removeprefix("/api/images/").removesuffix("/process")
            name = unquote(parts)
            try:
                exercises = process_single_image(name)
            except InvalidImageNameError:
                error = InvalidImageNameError("Invalid image name.")
                self.send_json(error_payload(error, "invalid_image_name"), HTTPStatus.BAD_REQUEST)
            except SourceImageNotFoundError as error:
                self.send_json(error_payload(error, "image_not_found"), HTTPStatus.NOT_FOUND)
            except (UnsupportedImageFormatError, BoardDetectionError) as error:
                # 422 means "the request shape was valid, but this image could
                # not be processed into the expected six chess boards."
                self.send_json(error_payload(error, "processing_failed"), HTTPStatus.UNPROCESSABLE_ENTITY)
            else:
                self.send_json({"exercises": exercises})
        else:
            self.send_error(HTTPStatus.NOT_FOUND)


def main() -> None:
    # Create generated-output folders before the first request. The source
    # images folder is allowed to be absent; the UI will show an empty state.
    ensure_storage()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), RequestHandler)
    print("Chess Puzzle Viewer running at http://localhost:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
