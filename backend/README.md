# Backend Notes

The root `README.md` is the main project guide. This file only covers backend
workflows that are useful when editing or debugging Python code.

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
