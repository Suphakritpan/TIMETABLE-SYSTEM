# The algorithm service: reading engine (poppler, tesseract OCR, LibreOffice) + scheduler (FET 6.8.5). Ubuntu 24.04 = the same
# tesseract and poppler as the development machine, so a file reads the same on Linux, Windows and macOS.
# Build context = the repo root (compose.yaml), so the paths below start from there.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 LANG=C.UTF-8 HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv \
        poppler-utils \
        tesseract-ocr tesseract-ocr-tha tesseract-ocr-eng \
        fet \
        libreoffice-writer-nogui libreoffice-calc-nogui \
        fonts-thai-tlwg \
    && rm -rf /var/lib/apt/lists/*

COPY algorithm/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY algorithm /app
ENV PATH=/opt/venv/bin:$PATH PYTHONPATH=/app

RUN useradd --create-home --uid 1000 app || true
USER 1000
EXPOSE 8000
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8000"]
