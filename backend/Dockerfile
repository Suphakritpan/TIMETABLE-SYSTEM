# The backend: the API the frontend talks to. It holds jobs, sessions, grading and exports; the heavy work (OCR, FET) is done by the
# algorithm service over HTTP (ALGO_URL). Pure-Python parts of algorithm/ are copied in for the cheap checks (model, checker, formats).
# Build context = the repo root (compose.yaml), so the paths below start from there.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY algorithm engine
COPY backend/app app
COPY backend/web web
COPY backend/config config
COPY backend/tests tests
COPY backend/tools tools
ENV PYTHONPATH=/app/engine:/app DEMO_SAMPLES=/samples DEMO_DATA=/tmp/ingest ALGO_URL=http://algorithm:8000

RUN useradd --create-home --uid 1000 app || true
USER 1000
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
