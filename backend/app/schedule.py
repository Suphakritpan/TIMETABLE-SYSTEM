"""DEMO APP, part 2: SCHEDULE. The rows from part 1 (its export, or straight from a reading) -> one term's problem ->
FET several times (a race), every step reported as an event -> OUR checker -> every class graded with its reasons.
No teachers in scheduling (user, 2026-10-29): pure classes of the student groups. Teacher names typed later only
give each teacher their own week, cut from the student timetable, with its own clash check; once names are typed
the next schedule keeps those teachers apart.
A person moves one class at a time (nothing else moves) and pins classes; the next schedule keeps pinned ones.
"""
import json
import re
import time
from pathlib import Path

from solver import fet

from . import algo
from solver.checker import check
from solver.model import activities, leaves, starts
from solver.model import longest as longest_block
from solver.precheck import precheck
from solver.solve import quality

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = json.loads((ROOT / "config" / "defaults.json").read_text(encoding="utf-8"))
SCHEMA = "timetable-schedule/1"
KIND = {"L": "บรรยาย", "P": "ปฏิบัติ", "A": "กิจกรรม", "E": "วิชาคณะอื่น", "R": "เวลาสำรองวิชาเลือก", "B": "พักกลางวัน"}
PART = {"gaps": "คาบว่างระหว่างวันน้อย", "balance": "แต่ละวันหนักพอ ๆ กัน", "late": "คาบเย็นน้อย",
        "lecture_lab_split": "บรรยายกับปฏิบัติคนละวัน"}

TERM_HOURS = 30                                          # a course list's first suggestion: hours a week in one term
SETTINGS = {"term": None, "codes": [], "groups": 1, "students": 30, "lecture_rooms": 6, "lab_rooms": 10,
            "days": ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"], "first": "08:00", "last": "17:00",
            "lunch": "flexible", "flag": True, "candidates": 5, "time_limit": 20, "include_fix": False}


def clock(h):
    return "%02d:00" % h


def hours_of(s):
    first, last = int(s["first"][:2]), int(s["last"][:2])
    hours = [clock(h) for h in range(first, last + 1)]
    if s["lunch"] == "fixed":                            # lunch 12-13 for everyone: simply not an hour
        hours = [h for h in hours if h != "12:00"]
    return hours


def session_from_rows(rows, source):
    """A new scheduling session from part 1's rows (its export or a reading)."""
    kind = "course_list" if rows and all((r.get("term") or 0) == 0 for r in rows) else "plan"
    terms = sorted({r["term"] for r in rows if r.get("term")})
    s = {"source": source, "rows": rows, "kind": kind, "terms": terms, "settings": dict(SETTINGS, term=terms[0] if terms else 1),
         "acts": [], "problem": None, "placed": {}, "pinned": set(), "moved": set(), "teachers": {}, "runs": [],
         "events": [], "status": "new", "result": None, "moves": [], "teacher_file": None, "cancel": False}
    s["issues"] = validate(rows)
    if kind == "course_list":
        # a suggestion to start from: the activity + the required subjects in the file's order while they fit ONE term
        # (a course list is the whole programme: all of it in one term is impossible - the rubric test found it)
        h = lambda r: (r.get("lecture") or 0) + (r.get("lab") or 0)
        codes, total = [], 0
        for r in rows:
            if r.get("choice", "required") == "required" and r.get("kind") in ("course", "activity") \
                    and (r.get("kind") == "activity" or total + h(r) <= TERM_HOURS):
                codes.append(r["code"])
                total += h(r)
        s["settings"]["codes"] = codes
    return s


def validate(rows):
    """Problems in the input itself, before any scheduling (a typed CSV can have them; a reading rarely does):
    the same subject twice in one term of one plan, hours missing, hours that are not numbers."""
    out, seen = [], {}
    for r in rows:
        k = (r.get("plan"), r.get("year"), r.get("term"), r.get("code"))
        seen[k] = seen.get(k, 0) + 1
    for (plan, year, term, code), n in seen.items():
        if n > 1 and code and "x" not in code.lower():
            out.append({"level": "red", "th": "รหัส %s ซ้ำ %d ครั้งใน %s ปี %s ภาค %s · ลบแถวที่ซ้ำ" % (code, n, plan or "-", year, term)})
    for r in rows:
        if r.get("kind", "course") == "course" and (r.get("lecture") is None or r.get("lab") is None) and "x" not in str(r.get("code", "")).lower():
            out.append({"level": "red", "th": "%s %s: ไม่มีชั่วโมง ท/ป · ใส่ตัวเลข (เช่น 1 และ 4)" % (r.get("code"), r.get("name_th") or "")})
    return out


def plan_short(label, i):
    m = re.search(r"\d{9}", re.sub(r"\s", "", label or ""))
    return m.group(0) if m else "แผน%d" % (i + 1)


def build(s):
    """The problem of one term from the rows and the settings. Elective slots and too-long blocks get the sample
    decisions (reserve the hours / another faculty's 3-hour course / off-site), shown in the live build step and as
    the class type in the result."""
    st = s["settings"]
    if s["kind"] == "course_list":
        want = set(st["codes"])
        rows = [{**r, "plan": "รายวิชาที่เลือก", "year": 1, "term": st["term"]} for r in s["rows"] if r["code"] in want]
    else:
        rows = [r for r in s["rows"] if r.get("term") == st["term"]]
    left_out = [r for r in rows if r.get("grade") == "fix" and not st["include_fix"]]
    rows = [r for r in rows if r not in left_out]
    grid = {"days": st["days"], "hours": hours_of(st),
            "lunch": {"window": ["11:00", "12:00"]} if st["lunch"] == "flexible" else None}
    longest = longest_block(grid)
    labels = list(dict.fromkeys(r["plan"] for r in rows))
    plans, electives, off, names = [], {}, [], {}
    for label, y in sorted({(r["plan"], r["year"]) for r in rows}, key=lambda k: (labels.index(k[0]), k[1])):
        short = plan_short(label, labels.index(label)) if len(labels) > 1 else "ปี%d" % y
        yid = short if len(labels) > 1 and len({yy for p, yy in {(r["plan"], r["year"]) for r in rows} if p == label}) == 1 \
            else ("%s-ปี%d" % (short, y) if len(labels) > 1 else short)
        names[yid] = label
        mine = [{**r, "lecture": r.get("lecture"), "lab": r.get("lab")} for r in rows if r["plan"] == label and r["year"] == y]
        if not any(not r.get("field_hours") for r in mine):
            continue
        plans.append({"id": yid, "groups": [{"name": "%s/%d" % (yid, g) if st["groups"] > 1 else yid, "students": st["students"]}
                                            for g in range(1, st["groups"] + 1)], "rows": mine})
        for r in mine:
            if r.get("kind") == "slot":
                electives["%s:%s" % (yid, r["order"])] = {"mode": "reserve", "code": "elective-%s" % r["order"]} \
                    if r.get("lecture") is not None else \
                    {"mode": "schedule", "code": "elective-%s" % r["order"], "lecture": 3, "lab": 0, "taught_by": "other"}
            elif max(r.get("lecture") or 0, r.get("lab") or 0) > longest:
                off.append("%s:%s" % (yid, r["code"]))
    whole = st["students"] * st["groups"]
    rooms = [{"name": "LEC-%d" % i, "type": "lecture", "seats": max(70, whole)} for i in range(1, st["lecture_rooms"] + 1)] + \
            [{"name": "LAB-%d" % i, "type": "lab", "seats": max(40, st["students"])} for i in range(1, st["lab_rooms"] + 1)]
    rules = dict(DEFAULTS["rules"])
    if st["lunch"] == "flexible":
        # the lunch hour must be free to sit at 11 OR 12, so a day needs room beside it: one more hour in the
        # even-spread limit (measured, CED term 2 with 1 group: slack 1 placed 40 of 56, slack 2 placed all, and
        # every other term / group count / fixed lunch still solves)
        rules["spread_slack"] = rules.get("spread_slack", 1) + 1
    problem = {**grid, "rules": rules, "room_types": DEFAULTS["room_types"], "rooms": rooms,
               "year_plans": plans, "electives": electives, "off_site": off, "pins": {}, "plan_names": names,
               "teachers": teacher_rules(s, grid["hours"])}
    return problem, left_out


def with_teachers(s, acts):
    """Who teaches each class: a name typed on the class wins, else the teacher file (by subject code). The solver
    then keeps every teacher's classes apart and away from the times they cannot teach."""
    by_code = (s["teacher_file"] or {}).get("by_code", {})
    for a in acts:
        if a["kind"] == "B":
            continue
        a["teachers"] = list(s["teachers"].get(a["key"]) or (by_code.get(a["code"], []) if a["kind"] in ("L", "P") else []))
    return acts


# ------------------------------------------------------------ the teacher file (CSV): teacher, subjects, unavailable,
# max_hours_day. "unavailable" = "จันทร์ 08:00-12:00; พุธ 13:00-17:00" (no teaching from 08:00 up to 12:00)
DAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]


def parse_teachers(data, rows):
    import csv
    import io
    table = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    need = [c for c in ("teacher", "subjects") if c not in (table.fieldnames or [])]
    if need:
        raise ValueError("ไม่มีคอลัมน์ %s (ดูแม่แบบ teachers-template.csv)" % ", ".join(need))
    codes = {r["code"] for r in rows}
    out, issues, owner = {"by_code": {}, "teachers": {}}, [], {}
    for n, r in enumerate(table, 2):
        name = (r.get("teacher") or "").strip()
        if not name:
            continue
        if name in out["teachers"]:
            issues.append({"level": "red", "th": "แถว %d: ครู %s ซ้ำ · รวมเป็นแถวเดียว" % (n, name)})
            continue
        spans = []
        for part in filter(None, (x.strip() for x in (r.get("unavailable") or "").split(";"))):
            m = re.match(r"^(\S+)\s+(\d\d?):(\d\d)\s*-\s*(\d\d?):(\d\d)$", part)
            if not m or m.group(1) not in DAY_NAMES or int(m.group(2)) >= int(m.group(4)):
                issues.append({"level": "red", "th": "แถว %d (%s): เวลาไม่ว่าง \"%s\" อ่านไม่ได้ · เขียนแบบ จันทร์ 08:00-12:00" % (n, name, part)})
                continue
            spans.append([m.group(1), int(m.group(2)), int(m.group(4))])
        most = (r.get("max_hours_day") or "").strip()
        out["teachers"][name] = {"unavailable": spans, "max_hours_day": int(most) if most.isdigit() else None}
        for code in (r.get("subjects") or "").split():
            if code not in codes:
                issues.append({"level": "amber", "th": "ครู %s: วิชา %s ไม่มีในหลักสูตรนี้ (ข้ามไป)" % (name, code)})
                continue
            if code in owner:
                issues.append({"level": "amber", "th": "วิชา %s มีครูสองคน (%s, %s): ทั้งคู่สอนคาบเดียวกัน" % (code, owner[code], name)})
            owner.setdefault(code, name)
            out["by_code"].setdefault(code, []).append(name)
    if not out["teachers"]:
        raise ValueError("ไม่มีชื่อครูในไฟล์")
    out["issues"] = issues
    return out


def teacher_rules(s, hours):
    """The teacher file as the solver's rules: each teacher's busy hours on this grid + most hours a day."""
    out = {}
    for name, t in ((s["teacher_file"] or {}).get("teachers") or {}).items():
        busy = [[d, h] for d, a, b in t["unavailable"] for h in hours if a <= int(h[:2]) < b]
        out[name] = {"busy": busy, "max_hours_day": t["max_hours_day"]}
    return out


# ------------------------------------------------------------ one run, step by step
def run(s, event):
    st, t0 = s["settings"], time.perf_counter()
    since = lambda: round(time.perf_counter() - t0, 3)
    event("stage", name="build", state="start")
    problem, left_out = build(s)
    if not problem["year_plans"]:
        raise ValueError("ไม่มีวิชาในภาคเรียนนี้ (หรือยังไม่ได้เลือกวิชา)")
    acts, issues = activities(problem)
    acts = with_teachers(s, acts)
    by_key = {a["key"]: a for a in acts}
    problem["pins"] = {k: list(v) for k, v in ((k, s["placed"].get(k)) for k in s["pinned"]) if k in by_key and v}
    lunch = [a for a in acts if a["kind"] == "B"]
    groups = [g["name"] for yp in problem["year_plans"] for g in yp["groups"]]
    event("stage", name="build", state="done", classes=len(acts) - len(lunch), lunch=len(lunch), groups=len(groups),
          hours=sum(a["hours"] for a in acts if a["kind"] != "B"), left_out=[r["code"] for r in left_out],
          off_site=problem["off_site"], pins=len(problem["pins"]), at=since())
    event("stage", name="precheck", state="start")
    pre = precheck(problem, acts, issues)
    pinned_at = {by_key[k]["id"]: tuple(v) for k, v in problem["pins"].items()}
    for b in check(problem, acts, pinned_at) if pinned_at else []:
        pre["problems"].append({"what": "pinned classes clash: " + b, "fix": "unpin or move one of them"})
        pre["possible"] = False
    event("stage", name="precheck", state="done", tightness=pre["tightness"], possible=pre["possible"],
          problems=[{"what": thai(p["what"], by_key), "fix": thai(p["fix"], by_key)} for p in pre["problems"]], at=since())
    s["problem"], s["acts"] = problem, acts
    if s.get("cancel"):
        return {"status": "cancelled", "precheck": pre, "candidates": []}
    if not pre["possible"]:
        s["placed"] = {k: v for k, v in s["placed"].items() if k in s["pinned"] and k in by_key}
        return {"status": "impossible", "precheck": pre, "candidates": []}
    event("stage", name="solve", state="start", candidates=st["candidates"])
    text = fet.write(problem, acts)
    # the runs race SIDE BY SIDE (each is its own FET program with its own fixed seed: same result as one by one,
    # measured; just faster on several cores)
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import os

    def one(seed):
        c0 = time.perf_counter()
        r = algo.fet_run(text, seed, st["time_limit"], lambda: s.get("cancel"))
        breaks = check(problem, acts, r["placements"]) if r["placements"] else []
        q, parts = quality(problem, acts, r["placements"]) if r["status"] == "solved" else (None, None)
        return {"seed": seed, "status": r["status"], "placed": len(r["placements"]), "of": len(acts), "quality": q,
                "parts": parts, "seconds": round(time.perf_counter() - c0, 3), "breaks": len(breaks), "_r": r}
    tried = []
    with ThreadPoolExecutor(max_workers=min(st["candidates"], os.cpu_count() or 1)) as pool:
        futures = []
        for seed in range(1, st["candidates"] + 1):
            event("candidate", seed=seed, state="start")
            futures.append(pool.submit(one, seed))
        for f in as_completed(futures):
            c = f.result()
            tried.append(c)
            event("candidate", state="done", **{k: v for k, v in c.items() if k != "_r"})
    tried.sort(key=lambda c: c["seed"])
    if s.get("cancel"):                                  # the person pressed cancel: the last timetable stays
        event("stage", name="solve", state="done", cancelled=True, at=since())
        return {"status": "cancelled", "precheck": pre, "candidates": strip(tried)}
    event("stage", name="solve", state="done", at=since())
    good = [c for c in tried if c["status"] == "solved" and not c["breaks"]]
    partial = [c for c in tried if c["_r"]["placements"] and not c["breaks"]]
    best = max(good, key=lambda c: c["quality"]) if good else (max(partial, key=lambda c: c["placed"]) if partial else None)
    event("stage", name="check", state="start")
    if best is None:
        event("stage", name="check", state="done", breaks=None, at=since())
        return {"status": "failed", "precheck": pre, "candidates": strip(tried),
                "message": tried[0]["_r"].get("message", "")}
    by_id = {a["id"]: a for a in acts}
    s["placed"] = {by_id[i]["key"]: list(p) for i, p in best["_r"]["placements"].items()}
    s["moved"] &= set(s["placed"])
    breaks = check(problem, acts, best["_r"]["placements"])
    event("stage", name="check", state="done", breaks=len(breaks), at=since())
    event("stage", name="score", state="start")
    q, parts = quality(problem, acts, best["_r"]["placements"])
    event("stage", name="score", state="done", quality=q, parts=parts, best=best["seed"], at=since())
    return {"status": "solved" if good else "partial", "precheck": pre, "candidates": strip(tried), "best": best["seed"]}


def strip(tried):
    return [{k: v for k, v in c.items() if k != "_r"} for c in tried]


# ------------------------------------------------------------ the view: every class graded with its reasons
def placements_by_id(s):
    return {a["id"]: tuple(s["placed"][a["key"]]) for a in s["acts"] if a["key"] in s["placed"]}


def view(s):
    problem, acts = s["problem"], s["acts"]
    if not problem:
        return None
    hours, hidx = problem["hours"], {h: i for i, h in enumerate(problem["hours"])}
    late_from = len(hours) - problem["rules"].get("late_periods", 0)
    pl = placements_by_id(s)
    breaks = check(problem, acts, pl) if pl else []
    busy = {}
    for a in acts:
        p = pl.get(a["id"])
        if p:
            for i in range(hidx[p[1]], hidx[p[1]] + a["hours"]):
                for g in leaves(problem, a["students_set"]):
                    busy.setdefault((g, p[0]), set()).add(i)
    days_of = {}
    for a in acts:
        p = pl.get(a["id"])
        if p and a["kind"] in ("L", "P"):
            days_of.setdefault((a["year_plan"], a["code"], a["kind"]), set()).add(p[0])
    rooms = {r["name"]: r for r in problem["rooms"]}
    classes, lunch = [], []
    for a in acts:
        p = pl.get(a["id"])
        groups = leaves(problem, a["students_set"])
        if a["kind"] == "B":
            if p:
                lunch.append({"group": a["students_set"], "day": p[0], "hour": p[1], "key": a["key"]})
            continue
        reasons = []
        mine = [b for b in breaks if a["key"] in b]
        if not p:
            grade = "fix"
            reasons.append({"level": "red", "th": unplaced_reason(problem, acts, a)})
        elif mine:
            grade = "fix"
            reasons += [{"level": "red", "th": thai(b, {x["key"]: x for x in acts})} for b in mine]
        else:
            start, end = hidx[p[1]], hidx[p[1]] + a["hours"] - 1
            if end >= late_from:
                reasons.append({"level": "amber", "th": "คาบเย็น (เลิก %s)" % clock(int(hours[end][:2]) + 1)})
            other = {"L": "P", "P": "L"}.get(a["kind"])
            if other and p[0] in days_of.get((a["year_plan"], a["code"], other), set()):
                reasons.append({"level": "amber", "th": "%sกับ%sอยู่วันเดียวกัน" % (KIND[a["kind"]], KIND[other])})
            for g in groups:
                used = busy.get((g, p[0]), set())
                if (start - 1 not in used and start - 1 >= min(used)) or (end + 1 not in used and end + 1 <= max(used)):
                    reasons.append({"level": "amber", "th": "ทำให้มีคาบว่างระหว่างวัน (%s)" % g})
                    break
            grade = "fixed" if a["key"] in s["moved"] else ("check" if reasons else "pass")
            if grade == "pass":
                reasons.append({"level": "ok", "th": "ไม่ชนกับกลุ่มหรือห้องอื่น"})
            if p[2] and p[2] in rooms:
                reasons.append({"level": "ok", "th": "ห้อง %s (%s %d ที่นั่ง ≥ %d คน)" % (
                    p[2], "บรรยาย" if rooms[p[2]]["type"] == "lecture" else "ปฏิบัติการ", rooms[p[2]]["seats"], a["students"])})
            elif a["kind"] in ("A", "E", "R"):
                reasons.append({"level": "info", "th": "ไม่ต้องใช้ห้อง (%s)" % KIND[a["kind"]]})
            if a["key"] in s["moved"]:
                reasons.append({"level": "person", "th": "ย้ายโดยคน (ปักหมุดไว้)"})
        classes.append({"key": a["key"], "code": a["code"], "name_th": a.get("name_th", ""), "kind": a["kind"],
                        "kind_th": KIND[a["kind"]], "hours": a["hours"], "students_set": a["students_set"], "groups": groups,
                        "students": a["students"], "room_type": a["room_type"],
                        "day": p[0] if p else None, "hour": p[1] if p else None, "room": p[2] if p else None,
                        "grade": grade, "reasons": reasons, "pinned": a["key"] in s["pinned"], "moved": a["key"] in s["moved"],
                        "teachers": s["teachers"].get(a["key"], [])})
    q, parts = quality(problem, acts, pl) if pl else (None, {})
    n = {g: sum(c["grade"] == g for c in classes) for g in ("pass", "check", "fix", "fixed")}
    return {"days": problem["days"], "hours": hours, "plan_names": problem["plan_names"], "flag": s["settings"]["flag"],
            "lunch_window": (problem.get("lunch") or {}).get("window"), "rooms": problem["rooms"],
            "groups": [g["name"] for yp in problem["year_plans"] for g in yp["groups"]],
            "classes": classes, "lunch": lunch,
            "summary": {"classes": len(classes), "placed": sum(1 for c in classes if c["day"]), "hard_breaks": len(breaks),
                        "quality": q, "parts": {PART[k]: round(v, 1) for k, v in parts.items()}, **n,
                        "pinned": len(s["pinned"]), "moved": len(s["moved"])},
            "breaks": [thai(b, {a["key"]: a for a in acts}) for b in breaks],
            "indicators": indicators(problem, acts, pl, classes, lunch),
            "teacher_rules": problem.get("teachers", {})}


def indicators(problem, acts, pl, classes, lunch):
    """Decision support: how full each room is, each group's free hours and gaps, each teacher's load."""
    hours, days = problem["hours"], problem["days"]
    hidx = {h: i for i, h in enumerate(hours)}
    slots = len(hours) * len(days)
    used = {}
    for c in classes:
        if c["day"] and c["room"]:
            used[c["room"]] = used.get(c["room"], 0) + c["hours"]
    rooms = [{"name": r["name"], "type": r["type"], "used": used.get(r["name"], 0), "of": slots,
              "pct": round(100 * used.get(r["name"], 0) / slots, 1)} for r in problem["rooms"]]
    by_type = {}
    for r in rooms:
        by_type.setdefault(r["type"], []).append(r["pct"])
    groups = []
    for g in [g["name"] for yp in problem["year_plans"] for g in yp["groups"]]:
        busy = {}
        for c in classes:
            if c["day"] and g in c["groups"]:
                busy.setdefault(c["day"], set()).update(range(hidx[c["hour"]], hidx[c["hour"]] + c["hours"]))
        for l in lunch:
            if l["group"] == g:
                busy.setdefault(l["day"], set()).add(hidx[l["hour"]])
        class_h = sum(c["hours"] for c in classes if c["day"] and g in c["groups"])
        gaps = sum((max(b) - min(b) + 1) - len(b) for b in busy.values() if b)
        groups.append({"group": g, "class_hours": class_h, "free": slots - class_h - sum(1 for l in lunch if l["group"] == g),
                       "gaps": gaps, "days": sum(1 for d in days if busy.get(d))})
    teachers = {}
    for c in classes:
        for t in c["teachers"]:
            x = teachers.setdefault(t, {"teacher": t, "hours": 0, "per_day": {}})
            if c["day"]:
                x["hours"] += c["hours"]
                x["per_day"][c["day"]] = x["per_day"].get(c["day"], 0) + c["hours"]
    return {"rooms": rooms, "room_types": {k: round(sum(v) / len(v), 1) for k, v in by_type.items()}, "groups": groups,
            "teachers": sorted(({"teacher": t["teacher"], "hours": t["hours"], "days": len(t["per_day"]),
                                 "max_day": max(t["per_day"].values(), default=0)} for t in teachers.values()),
                               key=lambda x: -x["hours"])}


def unplaced_reason(problem, acts, a):
    from solver.model import daily_limits
    limits = daily_limits(problem, acts)
    worst = None
    for g in leaves(problem, a["students_set"]):
        need = sum(x["hours"] for x in acts if g in leaves(problem, x["students_set"]))
        per_day = min(len(problem["hours"]), limits.get(g, len(problem["hours"])))
        if worst is None or need / (len(problem["days"]) * per_day) > worst[1] / worst[2]:
            worst = (g, need, len(problem["days"]) * per_day, per_day)
    g, need, have, per_day = worst
    return "ยังไม่ได้จัด: กลุ่ม %s ต้องใช้ %d ชม. จาก %d ชม. ที่มีในสัปดาห์ (ไม่เกิน %d ชม./วัน) · ลากไปวางในช่องว่าง หรือเพิ่มคาบ" % (
        g, need, have, per_day)


def label(key, acts):
    a = acts.get(key)
    return "%s %s" % (a["code"], KIND[a["kind"]]) if a and a["kind"] != "B" else ("พักกลางวัน" if a else key)


def thai(text, acts):
    """The checker's / pre-check's words in Thai, with class keys shown as code + kind."""
    keys = lambda s: re.sub(r"[^\s()]+:[^\s()]+:[A-Z]:[^\s()]+|lunch:[^\s()]+:[^\s()]+", lambda m: label(m.group(0), acts), s)
    pats = [(r"group (\S+) has two classes on (\S+) (\S+) \((.+) and (.+)\)", "กลุ่ม {0} มี {3} อยู่แล้ว ({1} {2})"),
            (r"room (\S+) is double-booked on (\S+) (\S+)", "ห้อง {0} ไม่ว่าง ({1} {2})"),
            (r"teacher (.+) has two classes on (\S+) (\S+) \((.+) and (.+)\)", "ครู{0} สอน {3} อยู่แล้ว ({1} {2})"),
            (r"(.+) runs across a break \(lunch\) on (\S+)", "{0} คร่อมเวลาพัก"),
            (r"(.+) runs past the end of the day", "{0} เกินคาบสุดท้ายของวัน"),
            (r"(.+) may only be at (.+)", "{0} อยู่ได้เฉพาะ {1}"),
            (r"group (\S+) has (\d+) hours on (\S+) \(max (\d+)\)", "กลุ่ม {0} มี {1} ชม. ใน{2} (ไม่เกิน {3})"),
            (r"(\S+) needs (\d+) hours a week, it can have (\d+)", "{0} ต้องใช้ {1} ชม./สัปดาห์ แต่มีได้ {2}"),
            (r"add (\d+) hour slots, or allow more hours a day", "เพิ่มคาบอีก {0} ชม. หรือให้เรียนวันละมากขึ้น"),
            (r"pinned classes clash: (.+)", "คาบที่ปักหมุดชนกัน: {0}"),
            (r"teacher (.+) said they are busy on (\S+) (\S+), but (.+) is there", "ครู{0} ไม่ว่าง {1} {2} (มี {3})"),
            (r"teacher (.+) has (\d+) hours on (\S+) \(max (\d+)\)", "ครู{0} สอน {1} ชม. ใน{2} (ไม่เกิน {3})"),
            (r"teacher (.+) must teach (\d+) hours but is free only (\d+) hours a week", "ครู{0} ต้องสอน {1} ชม. แต่ว่างแค่ {2} ชม./สัปดาห์"),
            (r"give some classes to another teacher, or ask (.+) to free more time", "ให้ครูคนอื่นสอนบางวิชา หรือขอให้ครู{0} ว่างเพิ่ม"),
            (r"unpin or move one of them", "เลิกปักหมุด หรือย้ายคาบใดคาบหนึ่ง"),
            (r"allow more hours a day, or split a block", "ให้เรียนวันละมากขึ้น หรือแบ่งคาบยาว")]
    text = keys(text)
    for pat, tpl in pats:
        m = re.match(pat, text)
        if m:
            return tpl.format(*m.groups())
    return text


# ------------------------------------------------------------ a person moves one class (nothing else moves)
def options(s, key):
    """Every start time of the class: fits (with the room it would get) or why not. The room: its own if free,
    else the first free room of the type with enough seats."""
    problem, acts = s["problem"], s["acts"]
    a = next(x for x in acts if x["key"] == key)
    by_key = {x["key"]: x for x in acts}
    base = placements_by_id(s)
    base.pop(a["id"], None)
    before = set(check(problem, acts, base))
    hidx = {h: i for i, h in enumerate(problem["hours"])}
    cur = s["placed"].get(key)
    rooms = [r["name"] for r in problem["rooms"] if r["type"] == a["room_type"] and r["seats"] >= a["students"]] \
        if a["room_type"] else [""]
    if cur and cur[2] in rooms:
        rooms.remove(cur[2])
        rooms.insert(0, cur[2])
    occupied = {}
    for x in acts:
        p = base.get(x["id"])
        if p and p[2]:
            for i in range(hidx[p[1]], hidx[p[1]] + x["hours"]):
                occupied[(p[2], p[0], i)] = True
    allowed = {tuple(x) for x in a["allowed"]} if a.get("allowed") else None
    out = []
    for d in problem["days"]:
        for i, h in enumerate(problem["hours"]):
            if allowed is not None and (d, h) not in allowed:
                continue
            if allowed is None and i not in starts(problem, a["hours"]):
                out.append({"day": d, "hour": h, "ok": False, "why": "คาบยาว %d ชม. เริ่มตรงนี้ไม่ได้ (เกินวันหรือคร่อมเวลาพัก)" % a["hours"]})
                continue
            room = next((r for r in rooms if not any((r, d, j) in occupied for j in range(i, i + a["hours"]))), None)
            if room is None:
                out.append({"day": d, "hour": h, "ok": False, "why": "ไม่มีห้อง%sว่าง" % ("บรรยาย" if a["room_type"] == "lecture" else "ปฏิบัติการ")})
                continue
            new = [b for b in check(problem, acts, {**base, a["id"]: (d, h, room)}) if b not in before]
            out.append({"day": d, "hour": h, "ok": not new, "room": room,
                        "why": thai(new[0], by_key) if new else None})
    return out


def move(s, key, day, hour):
    opt = next((o for o in options(s, key) if o["day"] == day and o["hour"] == hour), None)
    if not opt or not opt["ok"]:
        return False, (opt or {}).get("why") or "ย้ายไปช่องนี้ไม่ได้"
    s["moves"].append({"key": key, "from": s["placed"].get(key), "to": [day, hour, opt["room"]], "at": time.strftime("%H:%M:%S")})
    s["placed"][key] = [day, hour, opt["room"]]
    s["moved"].add(key)
    s["pinned"].add(key)                                 # a hand move is pinned: the next schedule keeps it (user)
    return True, None


# ------------------------------------------------------------ teachers: a week cut from the student timetable
def teacher_week(s, name):
    v = view(s)
    mine = [c for c in v["classes"] if name in c["teachers"] and c["day"]]
    hidx = {h: i for i, h in enumerate(v["hours"])}
    clashes = []
    for i, x in enumerate(mine):
        for y in mine[i + 1:]:
            if x["day"] == y["day"]:
                a0, a1 = hidx[x["hour"]], hidx[x["hour"]] + x["hours"]
                b0, b1 = hidx[y["hour"]], hidx[y["hour"]] + y["hours"]
                if a0 < b1 and b0 < a1:
                    clashes.append({"day": x["day"], "a": x["key"], "b": y["key"],
                                    "th": "%s: %s (%s) ซ้อนกับ %s (%s)" % (x["day"], x["code"], x["students_set"], y["code"], y["students_set"])})
    return {"name": name, "classes": mine, "clashes": clashes, "hours": sum(c["hours"] for c in mine)}


# ------------------------------------------------------------ export
COLUMNS = ["code", "name_th", "kind", "kind_th", "students_set", "groups", "hours", "day", "hour", "room", "teachers",
           "grade", "pinned", "moved", "reasons"]


def export_json(s):
    v = view(s)
    return {"schema": SCHEMA, "source": s["source"], "term": s["settings"]["term"], "settings": s["settings"],
            "grid": {"days": v["days"], "hours": v["hours"], "lunch_window": v["lunch_window"]},
            "groups": v["groups"], "plan_names": v["plan_names"], "summary": v["summary"], "rooms": v["rooms"],
            "classes": [{**{k: c[k] for k in COLUMNS[:-1]}, "students": c["students"], "room_type": c["room_type"],
                         "reasons": [r["th"] for r in c["reasons"]]} for c in v["classes"]],
            "lunch": v["lunch"], "moves": s["moves"], "teachers": v["teacher_rules"], "indicators": v["indicators"]}


def export_csv(s):
    import csv
    import io
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(COLUMNS)
    for c in view(s)["classes"]:
        w.writerow([" ".join(c[k]) if k in ("groups", "teachers") else
                    (" | ".join(r["th"] for r in c[k]) if k == "reasons" else ("" if c[k] is None else c[k])) for k in COLUMNS])
    return "﻿" + out.getvalue()
