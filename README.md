# Timetable system

    frontend/    React + TypeScript web app (mock API + Supabase today)      cd frontend && npm install && npm run dev
    backend/     FastAPI server, Dockerfile, compose, tests, rubric test      cd backend && docker compose up --build   -> :8081
    algorithm/   reading engine (OCR) + scheduler (FET) as its own service    docker image timetable-algorithm; backend calls it (ALGO_URL)
    doc/         design documents (start at doc/dev/README.md, overview: doc/project-overview.html)
    DB/          curriculum PDFs for tests and build_curricula.py

Run both: start the backend (port 8081), then `npm run dev` in `frontend/`; Vite proxies `/api` to the backend, so the
"read curriculum" step works against the real engine.

Everything in Docker: `docker compose up --build` at the repo root -> http://127.0.0.1:8080 (three containers: web = nginx serving the frontend and proxying `/api`; backend = API; algorithm = OCR + FET; needs `frontend/.env`).
