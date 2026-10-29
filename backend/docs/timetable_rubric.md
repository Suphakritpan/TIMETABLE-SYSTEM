# Rubric Score Table: Timetable Program Competition (English translation)

Total: **100 points**. Judged by a panel of experts.

| Section | Points |
|---|---|
| Program correctness / efficiency / quality (3.5.1 to 3.5.3) | 65 |
| 3.5.4 AI techniques | 20 |
| 3.5.5 Presentation and Q&A | 15 |
| **Total** | **100** |

---

## Part 1: Program correctness, efficiency and quality (65 points)

### 3.5.1 Timetable correctness and completeness (20 points)

| Item | Max | Levels | My score |
|---|---|---|---|
| a) No major conflicts (teacher double-booked / classes overlapping in a room / overlapping time slots). Choose 1 level. | 10 | Excellent: no conflicts at all across the standard case set (9-10). Good: at most 1 minor, easily fixed conflict (7-8). Fair: 2-3 conflicts, needs adjusting before use (4-6). Needs work: 4 or more conflicts, or a systematic error (0-3). | ___ |
| b) Meets conditions and constraints (room capacity, no-teaching periods, special conditions of teacher/subject/room). Choose 1 level. | 6 | Excellent: passes all conditions (5-6). Good: fails 1 condition slightly (4). Fair: fails 2-3 conditions (2-3). Needs work: fails many main conditions (0-1). | ___ |
| c) Actually usable as briefed (overall reasonableness, usable without major rework). Choose 1 level. | 4 | Excellent: usable immediately (4). Good: usable with small tweaks (3). Fair: needs many tweaks (2). Needs work: not usable (0-1). | ___ |

### 3.5.2 System efficiency and speed (10 points)

| Item | Max | Expected evidence / levels | My score |
|---|---|---|---|
| a) Status/responsiveness during calculation (UX) | 5 | User sees progress/status, has a cancel/retry button. Excellent 4-5; Good 3; Fair 2; Needs work 0-1. | ___ |
| b) Stability during testing | 3 | Freezing, crashing, repeated errors. Excellent 3; Good 2; Fair 1; Needs work 0. | ___ |
| c) End-to-end continuity | 2 | Import → calculate → verify → export, complete sequence. Excellent 2; Fair 1; Needs work 0. | ___ |

### 3.5.3 Program development quality (35 points)

#### A) Input (10 points)

| Item | Max | Expected evidence | My score |
|---|---|---|---|
| File format + template file | 3 | Supports at least 1 format (CSV / Excel / JSON etc.) and provides a ready-to-use template | ___ |
| Validation before calculation | 3 | Reports problems (duplicate IDs / overlapping times / not enough rooms / free slots) with short suggestions | ___ |
| Sample datasets | 2 | Small, medium and large samples that actually import | ___ |
| Preview / summary before saving | 2 | Short, clear import steps with a preview/summary page | ___ |

#### B) Process / Engine (15 points)

| Item | Max | Expected evidence | My score |
|---|---|---|---|
| Explain factors and priority order | 4 | Teacher, room, time, special conditions, explained briefly and clearly | ___ |
| No class/room clashes + evidence | 6 | Easy-to-understand proof (number summaries / check messages) | ___ |
| Settings / re-testing (because of randomness) | 3 | Explain the seed / repeat mode or a short way to compare results | ___ |
| Overall suitability of approach | 2 | Understandable, credible, fits the brief | ___ |

#### C) Output and usage (Output / UI / Report) (8 points)

| Item | Max | Expected evidence | My score |
|---|---|---|---|
| Readable table + search/filter | 3 | Day / room / teacher views plus basic search/filter | ___ |
| Decision-support indicators | 2 | Room utilization, free periods, teacher workload, etc. | ___ |
| File export | 2 | PDF / Excel / CSV that can be used further | ___ |
| Understandable error messages | 1 | Short fix suggestions when errors occur | ___ |

#### D) Deploy and Ops (2 points)

| Max | Levels | My score |
|---|---|---|
| 2 | Online and fully working = 2. Online doesn't work but offline version / dev machine works fully = 1. Doesn't work = 0. | ___ |

---

## Part 2: 3.5.4 Applying AI techniques (20 points)

| Item | Max | Expected evidence | My score |
|---|---|---|---|
| Method/algorithm suited to the brief | 6 | Pick a method that fits the problem and explain how it handles conditions/constraints (ML, LLM, CSP, GA/SA, etc.) | ___ |
| Agent / agentic approach | 4 | Explain the agent's role (plan-act-check, calling tools/databases, multi-agent) | ___ |
| Evidence of beating a baseline | 6 | Comparison numbers / case examples: fewer conflicts, less time, more flexibility | ___ |
| Creativity and extension | 2 | New idea with a path to real-world use | ___ |
| Transparency and reproducibility | 2 | Briefly explain settings; results repeatable; no hidden values that can't be verified | ___ |

---

## Part 3: 3.5.5 Presentation and Q&A (15 points)

| Item | Max | Expected evidence | My score |
|---|---|---|---|
| Structure and clarity | 6 | Problem → approach → results/benefits, complete and easy to follow | ___ |
| Time management and conciseness | 2 | Within 5-10 minutes, focused on essentials | ___ |
| Slides / visual aids | 3 | Easy to read, appropriate, not cluttered | ___ |
| Personality and confidence | 2 | Clear voice, good interaction, professional | ___ |
| Q&A | 2 | Correct, fluent answers linked to evidence | ___ |

---

## Competition levels: regional vs national (academic years 2568-2572)

| Area | Regional level (school / region) | National level |
|---|---|---|
| Competencies used | Level-4 competencies as a base, e.g. basic AI techniques and understanding of program structure | Level-4 competencies in depth, advanced AI, explained professionally |
| Problem analysis and requirements | Analyze timetable conditions from the given brief and propose a systematic initial solution | Systematic analysis of complex, multi-case problems; handle many sub-conditions with software engineering thinking |
| AI algorithm design | Choose and use basic AI algorithms (Heuristic, Basic Genetic Algorithm) and explain the principle | Design and tune advanced AI algorithms (Adaptive GA, ML or LLM) with comparative pros/cons analysis |
| Program development | Working program that meets main conditions (no teacher clashes, no duplicate rooms), based on baseline code | Well-structured, modular code with error detection, high efficiency, handles large data |
| Testing and improvement | Normal cases, basic correctness check | Edge cases, stress tests, time/memory analysis, optimize the algorithm to the maximum |
| Presentation | Clear presentation, uses visual aids, answers general questions | Professional presentation with a real demo; explains system structure and concepts; answers in-depth AI questions |

---

## Quick checklist (max points per item)

- [ ] 3.5.1 a) No conflicts (10)
- [ ] 3.5.1 b) Conditions met (6)
- [ ] 3.5.1 c) Usable as briefed (4)
- [ ] 3.5.2 a) Status/responsiveness (5)
- [ ] 3.5.2 b) Stability (3)
- [ ] 3.5.2 c) End-to-end flow (2)
- [ ] 3.5.3 A) File format + template (3)
- [ ] 3.5.3 A) Pre-calculation validation (3)
- [ ] 3.5.3 A) Sample datasets (2)
- [ ] 3.5.3 A) Preview/summary (2)
- [ ] 3.5.3 B) Explain factors and priority (4)
- [ ] 3.5.3 B) No clashes + evidence (6)
- [ ] 3.5.3 B) Seed / re-testing (3)
- [ ] 3.5.3 B) Approach suitability (2)
- [ ] 3.5.3 C) Table + search/filter (3)
- [ ] 3.5.3 C) Decision indicators (2)
- [ ] 3.5.3 C) File export (2)
- [ ] 3.5.3 C) Error messages (1)
- [ ] 3.5.3 D) Deploy online (2)
- [ ] 3.5.4 Method suited to brief (6)
- [ ] 3.5.4 Agent/agentic (4)
- [ ] 3.5.4 Beats baseline with evidence (6)
- [ ] 3.5.4 Creativity (2)
- [ ] 3.5.4 Transparency / reproducibility (2)
- [ ] 3.5.5 Structure and clarity (6)
- [ ] 3.5.5 Time management (2)
- [ ] 3.5.5 Slides (3)
- [ ] 3.5.5 Personality (2)
- [ ] 3.5.5 Q&A (2)
