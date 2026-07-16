FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY puzzles-images puzzles-images
RUN mkdir -p data/boards

EXPOSE 8000
CMD ["python", "-m", "backend.server"]
