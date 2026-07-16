# Board splitter

This is the first implementation stage. It detects the six printed chess
diagrams on one photographed book page and perspective-corrects each one into
an 800-by-800 PNG.

## Run locally

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/board_splitter.py puzzles-images/IMG_1345.HEIC output/IMG_1345
```

Inspect `detected-boards.jpg` before using the cropped boards for FEN
recognition. Red outlines identify the boundary used for each crop and numbers
show the reading order: top-left to bottom-right.

The splitter raises `BoardDetectionError` if it cannot establish six diagrams.
It only interpolates one missing middle-row board when the other five confirm
an unambiguous 2-by-3 layout; all other detection failures require review.
