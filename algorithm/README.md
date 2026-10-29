# algorithm

The part with no web server in it: reading a curriculum and scheduling it. `backend/app` imports these as top-level packages
(`from solver...`, `from importer...`); the Docker image copies this folder to `/app/engine` and sets `PYTHONPATH=/app/engine:/app`.

    timetable_core/  document model and Thai text normalising
    importer/        convert (PDF / Word / Excel / photo), OCR, layout formats (formats/*.json), reader, glyph tool
    solver/          model, pre-check, FET writer/runner (FET 6.8.5), our own clash checker, quality score

Run and test it through `backend/` (needs poppler, tesseract and FET, which the Docker image has).

## As a service

`service.py` (FastAPI, `algorithm/Dockerfile`) is what the backend talks to: `/health`, `/read` (NDJSON progress stream, closing the
connection cancels OCR), `/fet/run` (closing the connection stops FET), `/crop`. Details at the top of `service.py`.
The backend image holds only Python (no OCR, no FET); this image holds the heavy tools.
