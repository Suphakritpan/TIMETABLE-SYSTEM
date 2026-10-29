# PROGRESS: what we have done, where it stands, what is next

The project: an automatic class timetable for Thai institutions (universities and vocational colleges). Open source,
runs on any computer with Docker (Linux / Windows / macOS), works offline.
Scored against the competition rubric: `docs/timetable_rubric.md` (100 points). **Every change is tested with
`docker compose run --rm rubric`** -> `reports/rubric-latest.md`.

## How to run

    docker compose up --build                 the app -> http://127.0.0.1:8080   (① read, ② schedule)
    docker compose run --rm rubric            the rubric test: CED, TATC, Chula (~1 min; first time ~3 min)
    docker run --rm -v "$PWD/samples:/samples:ro" timetable-demo python3 -m unittest discover tests

Test files: `samples/` (inside this folder; README.txt inside says what each one is).

## Where it stands (rubric test, 2026-10-29 06:42)

Measured: **62 / 63** (items this tool can measure) · panel-only items: up to **37** more · total 100 · run took 15 s

Full report with every rubric item and its evidence: `reports/rubric-latest.md`.

The 3 test files (user: CED, TATC, Chula), 5 terms, each with its MADE-UP teacher file (`samples/teachers/`,
made by `tools/make_teachers.py`: a curriculum has no teachers):

| case | size | read | rows (✓/⚠/✗/?) | vs checked answer | result | placed | conflicts (our count) | quality | baseline placed / quality | solve s |
|---|---|---|---|---|---|---|---|---|---|---|
| ced-t1 | small | 146.5 s (saved) | 57 (42/1/0/14) | 100.0% right, 0 silent | solved | 38/38 | 0 | 93.5 | 38/38 / 83.1 | 0.165 |
| ced-t2-2groups | small | 146.5 s (saved) | 57 (42/1/0/14) | 100.0% right, 0 silent | solved | 39/39 | 0 | 91.8 | 39/39 / 75.8 | 0.225 |
| tatc-t1 | medium | 45.7 s (saved) | 147 (140/6/1/0) | 99.3% right, 0 silent | solved | 114/114 | 0 | 93.1 | 114/114 / 81.9 | 0.408 |
| tatc-t2 | medium | 45.7 s (saved) | 147 (140/6/1/0) | 99.3% right, 0 silent | solved | 105/105 | 0 | 94.4 | 105/105 / 86.9 | 0.298 |
| chula-t1 | large | 23.0 s (saved) | 207 (146/0/0/61) | - | solved | 121/121 | 0 | 89.7 | 121/121 / 82.7 | 0.575 |

## What is next

Measured points still lost: **-1** 3.5.3 D put it online (needs a server or hosting account: the user's decision).

Panel-only items (37 points: presentation, AI method, agentic, creativity, usability) - what to prepare:
- 3.5.3 B1 a one-page "factors and priority" (hard rules never broken; soft rules = the quality score and its weights)
- 3.5.4 b agentic: an agent that reads a ✗ row's reason and proposes the fix (plan -> act -> check)
- 3.5.5 the 5-10 minute talk: the two live dashboards + replay, the baseline numbers above
- Also wanted (not rubric): the สท.4 A4 print

## The history (short)

| when | what |
|---|---|
| 2026-10-22 to 25 | Design (timetable-plan/Plan Z): users, journeys, sitemap, flows, wireframes, simulated tests, visual style |
| 2026-10-25 to 28 | First engine + full website (code on GitHub anonmianwe/timetable): reading Thai curricula (text, scans by OCR, garbled fonts), FET scheduling, our own checker, accounts, approval |
| 2026-10-28 | Benchmarks: the glyph tool beats Tesseract alone; 0 wrong-and-silent values on every measured file |
| 2026-10-29 | Plan A (one planner, one term); the MVP (no login) |
| 2026-10-29 | **The remake (this folder)**: a demo app in 2 parts. ① INGEST: upload -> live dashboard (steps, pages, layouts tried) -> every subject graded with a reason (✓ ⚠ ✗ ?) -> a person fixes values -> JSON / CSV. ② SCHEDULE: the input check -> live race of FET runs (+ slow replay for presenting) -> every class graded -> drag ONE class (it floats, nothing else moves, auto-pinned) -> pins kept on re-run -> teacher names give each teacher a week with its own clash check -> JSON / CSV |
| 2026-10-29 | Teachers (made-up files: who teaches what, times they cannot teach, most hours a day) kept by the solver and checked by the rubric's own counter; CANCEL for reading (kills OCR at once, 0.2 s) and scheduling (0.6 s); indicators: room use %, each group's free hours and gaps, each teacher's load. Rubric 57 -> 62 / 63 |
| 2026-10-29 | Course lists without a term plan; the movable lunch hour (11-12 or 12-13); a CSV template; input checks (duplicates, missing hours) |
| 2026-10-29 | **The rubric test** (`tools/rubric.py`): 6 real cases small to large, its own conflict counter, a first-fit baseline, repeat runs, broken files. It found two real faults, both fixed (and made the run 29 s: readings are saved, runs race in parallel): a course list suggested a whole programme for one term (impossible); and on the large case a practice block could cover both lunch hours, so FET got stuck at 574 of 761 classes (now 760/760) |

## Decisions (the user's)

- No teachers while scheduling: pure classes of the student groups; teacher weeks are cut from it later.
- Lunch: every group 1 free hour a day, 11-12 or 12-13 (movable), or fixed 12-13.
- A hand move moves only that class and pins it; "จัดใหม่" keeps pinned classes.
- No git commit / push: the project is shared as a folder / zip.
- Plans: `~/Desktop/timetable-plan` (Plan A = this first release, Plan Z = everything later).
