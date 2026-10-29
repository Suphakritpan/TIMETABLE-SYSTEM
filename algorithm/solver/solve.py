"""SOLVE one term: pre-check -> N candidates from FET (different seeds) -> our own check -> the best one, scored.
FET stops at the FIRST valid timetable, so a longer time limit does not make it better; more candidates do
(spec, SPEED AND QUALITY). If nothing solves: the best PARTIAL result + every unplaced class with its reason.
"""
import statistics
import time

from . import fet
from .checker import check
from .model import activities, leaves
from .precheck import precheck

WEIGHTS = {"gaps": 1, "balance": 1, "late": 1, "lecture_lab_split": 1}    # equal unless the rules say otherwise


def quality(problem, acts, placements):
    """0-100 from the soft rules (same measure as the benchmark): few gaps, days balanced, few late hours,
    a course's lecture and lab on different days."""
    hours, hidx = problem["hours"], {h: i for i, h in enumerate(problem["hours"])}
    busy = {}
    for a in acts:
        p = placements.get(a["id"])
        if not p:
            continue
        for i in range(hidx[p[1]], min(hidx[p[1]] + a["hours"], len(hours))):
            for g in leaves(problem, a["students_set"]):
                busy[(g, p[0], i)] = True
    groups = sorted({g for g, _, _ in busy})
    gaps = total = 0
    balance = []
    for g in groups:
        per_day = []
        for d in problem["days"]:
            used = sorted(i for gg, dd, i in busy if gg == g and dd == d)
            if used:
                gaps += (used[-1] - used[0] + 1) - len(used)
                per_day.append(len(used))
            total += len(used)
        if per_day:
            balance.append(statistics.mean(per_day) / max(per_day))
    rules = problem.get("rules", {})
    late = sum(1 for g, d, i in busy if i >= len(hours) - rules.get("late_periods", 0))
    pairs = {}
    for a in acts:
        p = placements.get(a["id"])
        if p and a["kind"] in ("L", "P"):
            pairs.setdefault((a["year_plan"], a["code"]), {}).setdefault(a["kind"], set()).add(p[0])
    both = [v for v in pairs.values() if "L" in v and "P" in v]
    parts = {"gaps": 100 * (1 - min(1, gaps / total)) if total else 100,
             "balance": 100 * statistics.mean(balance) if balance else 100,
             "late": 100 * (1 - late / len(busy)) if busy else 100,
             "lecture_lab_split": 100 * sum(1 for v in both if not (v["L"] & v["P"])) / len(both) if both else 100}
    weights = rules.get("quality_weights", WEIGHTS)
    return round(sum(parts[k] * weights.get(k, 0) for k in parts) / (sum(weights.get(k, 0) for k in parts) or 1), 1), parts


def solve(problem, candidates=3, time_limit=10):
    """Returns a JSON-friendly result:
       status      solved | partial | impossible | failed
       precheck    {possible, problems [{what, fix}], tightness}
       timetable   {activity key: [day, hour, room]}           (the best candidate)
       unplaced    [{key, code, students_set, hours, reason}]  (the tray, when partial)
       candidates  [{seed, status, placed, quality, seconds, breaks}]
       activities  every activity (key, code, kind, hours, students_set, room_type)"""
    acts, issues = activities(problem)
    pre = precheck(problem, acts, issues)
    # pinned classes are placements already: our own checker tests them BEFORE the scheduler runs
    # (measured: FET ignores its time limit and hangs on pins that contradict each other)
    by_key = {a["key"]: a for a in acts}
    pinned = {by_key[k]["id"]: tuple(v) for k, v in problem.get("pins", {}).items() if k in by_key}
    for b in check(problem, acts, pinned) if pinned else []:
        pre["problems"].append({"what": "pinned classes clash: " + b, "fix": "unpin or move one of them"})
        pre["possible"] = False
    base = {"precheck": pre, "activities": acts, "candidates": [], "timetable": {}, "unplaced": []}
    if not pre["possible"]:
        return {**base, "status": "impossible"}
    text = fet.write(problem, acts)
    tried = []
    for seed in range(1, candidates + 1):
        t0 = time.perf_counter()
        r = fet.run(text, seed, time_limit)
        breaks = check(problem, acts, r["placements"]) if r["placements"] else []
        q = quality(problem, acts, r["placements"])[0] if r["status"] == "solved" else None
        tried.append({"seed": seed, "status": r["status"], "placed": len(r["placements"]), "quality": q,
                      "seconds": round(time.perf_counter() - t0, 2), "breaks": breaks, "_r": r})
    good = [c for c in tried if c["status"] == "solved" and not c["breaks"]]
    if good:
        best, status = max(good, key=lambda c: c["quality"]), "solved"
    else:
        partial = [c for c in tried if c["_r"]["placements"] and not c["breaks"]]
        if not partial:
            return {**base, "status": "failed", "candidates": [strip(c) for c in tried],
                    "message": tried[0]["_r"].get("message", "")}
        best, status = max(partial, key=lambda c: c["placed"]), "partial"
    placed = best["_r"]["placements"]
    by_id = {a["id"]: a for a in acts}
    timetable = {by_id[i]["key"]: list(p) for i, p in placed.items()}
    unplaced = [{"key": a["key"], "code": a["code"], "students_set": a["students_set"], "hours": a["hours"],
                 "reason": reason(problem, acts, placed, a)} for a in acts if a["id"] not in placed]
    return {**base, "status": status, "timetable": timetable, "unplaced": unplaced,
            "candidates": [strip(c) for c in tried], "quality": best["quality"]}


def reason(problem, acts, placed, a):
    """Why a class is in the tray: its busiest group, counted against the limit that really binds - the
    hours a day that group may have (max hours a day / the spread rule), not the whole empty week."""
    from .model import daily_limits
    limits = daily_limits(problem, acts)
    worst = None
    for g in leaves(problem, a["students_set"]):
        need = sum(x["hours"] for x in acts if g in leaves(problem, x["students_set"]))
        per_day = min(len(problem["hours"]), limits.get(g, len(problem["hours"])))
        have = len(problem["days"]) * per_day
        if worst is None or need / have > worst[1] / worst[2]:
            worst = (g, need, have, per_day)
    g, need, have, per_day = worst
    if per_day < len(problem["hours"]):
        return ("%s needs %d hours and may have at most %d a day (%d in the week) - the scheduler ran out of time "
                "fitting it; drag it into a free slot, or allow more hours a day" % (g, need, per_day, have))
    return ("%s needs %d of the %d hours in the week - the scheduler ran out of time fitting it; "
            "drag it into a free slot" % (g, need, have))


def strip(c):
    return {k: v for k, v in c.items() if k != "_r"}
