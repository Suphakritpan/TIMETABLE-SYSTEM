# Timetable demo · ① INGEST and ② SCHEDULE

Upload a curriculum (PDF text / PDF scan / Word / Excel / photo). The page shows it being read **live**:
the steps, every page (text or OCR), every known layout's score. Then every subject is **graded with its reason**:

| grade | meaning |
|---|---|
| ✓ ผ่าน | read cleanly, the credit rule holds (and the term's printed total adds up) |
| ⚠ ตรวจดู | read, but repaired or uncertain: the reason says what |
| ✗ ต้องแก้ | cannot be used as read: fix it on the page (click the row) |
| ? กำหนดภายหลัง | an elective slot (x-x-x): not an error |
| ✎ แก้โดยคน | a person fixed it; what it was is kept |

Click a row to see the piece of the page it was read from. Export **JSON** or **CSV** (schema `timetable-ingest/1`),
or press **→ ส่งต่อไปจัดตาราง**.

**② Schedule** (`schedule.html`): part 1's rows -> check the input + set the term (groups, rooms, days, periods,
lunch) -> watch it live: build -> pre-check (how tight; impossible = why, before solving) -> several FET runs racing
-> our own checker -> quality score; **▶ เล่นซ้ำ** replays it slowly for a presentation. Every class is graded
(✓ / ⚠ cost / ✗ not placed / ✎ moved by a person) with its reasons. No teachers while scheduling: pure classes.
- drag ONE class: it floats, every cell shows fits (green) or clashes (red + why), nothing else moves; a moved class is pinned
- 📌 pin any class: "จัดใหม่" keeps pinned classes and arranges the rest
- type teacher names on classes, search a name: that teacher's week, with its own clash check; the next schedule keeps
  named teachers apart
- lunch: 1 free hour a day for every group, 11-12 or 12-13 (movable), or fixed 12-13
- teachers (optional CSV: who teaches what, times they cannot teach, most hours a day; template `web/teachers-template.csv`;
  made-up files for the test PDFs in `samples/teachers/`): never double-booked, never in their busy times
- ■ cancel: stops a reading (kills the OCR at once) or a run
- indicators: room use %, each group's free hours and gaps, each teacher's hours
- export JSON (schema `timetable-schedule/1`) / CSV

## Run (Linux, Windows, macOS: needs Docker)

    docker compose up --build        ->  http://127.0.0.1:8080
    docker compose down              (stop)

The sample buttons use the `samples` folder inside this one.

## Tests

    docker compose run --rm rubric             the RUBRIC TEST (docs/timetable_rubric.md): every item scored with
                                               evidence -> reports/rubric-latest.md  (CED, TATC, Chula; --fresh: read again)
    docker run --rm -v "$PWD/samples:/samples:ro" timetable-backend python3 -m unittest discover tests

What has been done, the numbers and what is next: PROGRESS.md.

## Folders

    ../algorithm/  the algorithms, their own folder AND their own service (algorithm/service.py, own Docker image).
                   The backend calls it over HTTP (ALGO_URL, see app/algo.py) for the heavy jobs: reading a file
                   (OCR), running FET, cropping a page. Without ALGO_URL it runs them in-process instead.
    app/      algo.py (the client of the algorithm service), server.py (the API), grade.py (part 1 grades + export), schedule.py (part 2: run, grades, moves, teachers)
    web/      only the CSV templates now; the page lives in ../frontend
    config/   samples.json (the sample buttons), answers/ (checked answers: accuracy for known files)
    tests/    unit + end-to-end tests
    tools/    rubric.py: the rubric test (own conflict counter, a first-fit baseline, repeat runs, broken files)
    reports/  the rubric test's results (rubric-latest.md)
    docs/     timetable_rubric.md: the competition rubric
