"""Small file-based cache for split puzzle boards.

The cache intentionally stores only reproducible information: the source image
mtime/size and paths to generated crops.  If either source metadata changes,
the page is split again.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ExerciseCache:
    """Persist page processing metadata in a local JSON file."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            # JSON keeps the cache inspectable for humans. You can open
            # data/cache.json and see exactly which source image produced which
            # generated board files.
            return json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # A corrupt cache must never prevent the source images being used.
            return {}

    def write(self, content: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.path.with_suffix(".tmp")
        # Write to a temporary file and replace the real cache at the end. That
        # avoids leaving a half-written JSON file if the process stops mid-write.
        temporary_path.write_text(json.dumps(content, indent=2, sort_keys=True), encoding="utf-8")
        temporary_path.replace(self.path)
