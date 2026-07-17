# Backend Notes

The root `README.md` is the main project guide. This file only covers backend
workflows that are useful when editing or debugging Python code.

## Module structure

The backend is split into focused modules with clear responsibilities:

```
server.py               HTTP transport. Routes requests, serves static files.
exercise_service.py     Facade. Cache coordination and API response building.
image_repository.py     Source image listing, validation, format checks.
processing_pipeline.py  Orchestrates board splitting, recognition, and saving.
board_splitter.py       OpenCV image processing. Detects and crops six boards.
recognizer.py           Optional chess image to FEN prediction wrapper.
cache.py                JSON file cache with atomic writes.
```

Dependency graph (no cycles):

```
cache.py
    ↑
image_repository.py     board_splitter.py ← recognizer.py
    ↑                          ↑
    └── exercise_service.py ───┘
              ↑                  processing_pipeline.py
              │                       ↑
           server.py ────────────────┘
```

- **server.py** knows about HTTP but not about images or caching.
- **image_repository.py** knows about source files but not about processing.
- **processing_pipeline.py** knows about board_splitter and recognizer but not about caching.
- **exercise_service.py** ties everything together for the API layer.

## Board splitter CLI

Use this command when you want to test only the image-processing step, without
opening the browser app:

```sh
.venv/bin/python backend/board_splitter.py puzzles-images/IMG_1345.HEIC output/IMG_1345
```

The command writes `board-01.png` through `board-06.png` plus
`detected-boards.jpg`.

Inspect `detected-boards.jpg` before trusting the crops. If the red outlines are
wrong, FEN recognition will also be unreliable.

## Detection behavior

`board_splitter.py` expects exactly six chess diagrams on the page.

It raises `BoardDetectionError` when it cannot safely establish six boards. It
only recovers one missing board in a narrow case: five detected boards that
clearly form a 2-by-3 layout with the missing board in the middle row.

That strict behavior is intentional. A clear failure is better than silently
generating wrong crops.
