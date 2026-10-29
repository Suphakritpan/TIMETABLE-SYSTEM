"""GRADING and EXPORT of one reading (demo part 1, Ingest).

Every row gets one grade with its reasons (Thai first, the engine's own words kept beside them):
  pass     read cleanly, the credit rule holds (and the term's printed total adds up, where there is one)
  check    read, but repaired or uncertain (amber in the engine)
  fix      cannot be used as read (red in the engine)
  unknown  unknown BY DESIGN: an elective slot (x-x-x), decided later - not an error
  fixed    a person changed it on the dashboard (what it was is kept)
The export (JSON / CSV) is the contract with part 2, the schedule engine: schema "timetable-ingest/1".
"""
import csv
import io
import json
import re
from pathlib import Path

SCHEMA = "timetable-ingest/1"
ANSWERS = Path(__file__).resolve().parent.parent / "config" / "answers"
GRADES = ("pass", "check", "fix", "unknown", "fixed")

# the engine's reasons in Thai: (pattern on the English reason, Thai template using its groups)
THAI = [
    (r"read through table lines: (.*) -> (.*)", "อ่านผ่านเส้นตาราง: {0} → {1}"),
    (r"hours read once only \((.*)\) and this term's total does not add up", "ชั่วโมง ({0}) อ่านได้ทางเดียว และผลรวมภาคไม่ตรง"),
    (r"hours: the cell reads (\S+), the page (\S+)", "ชั่วโมง: ช่องตารางอ่านได้ {0} แต่ทั้งหน้าอ่านได้ {1} (ใช้ค่าช่องตาราง)"),
    (r"hours: (.*)", "ชั่วโมง: {0}"),
    (r"name repaired: (.*) -> (.*)", "ซ่อมชื่อวิชา: {0} → {1}"),
    (r"not found in the course list", "ไม่พบในรายวิชาของหลักสูตร"),
    (r"only the credit is printed and there is no course list for the hours", "พิมพ์แค่หน่วยกิต ไม่มีรายวิชาให้ดูชั่วโมง"),
    (r"prerequisite (\S+) \(of (\S+)\) is not in this curriculum's course list", "วิชาบังคับก่อน {0} (ของ {1}) ไม่อยู่ในหลักสูตรนี้"),
    (r"term (\d+) worked out from the order of terms \(heading read as (\d+)\)", "ภาค {0} คิดจากลำดับภาค (หัวข้ออ่านได้ {1})"),
    (r"term heading reads (\S+): taken as S = summer \(term (\d+)\)", "หัวข้อภาคอ่านได้ {0}: ถือเป็นภาคฤดูร้อน"),
    (r"year (\d+) worked out from the order of terms \(heading unreadable\)", "ปี {0} คิดจากลำดับภาค (อ่านหัวข้อไม่ได้)"),
    (r"credits not sure: (.*)", "หน่วยกิตไม่แน่ใจ: {0}"),
    (r"no credit value on this row", "แถวนี้ไม่มีหน่วยกิต"),
    (r"plan says (\S+) credits, the course list says (\S+)", "แผนการเรียนบอก {0} หน่วยกิต แต่รายวิชาบอก {1}"),
    (r"plan says (\S+) = (\S+), the course list says (\S+)", "แผนการเรียนบอก {0} = {1} แต่รายวิชาบอก {2}"),
    (r"two credit values printed: (.*)", "พิมพ์หน่วยกิตไว้สองค่า: {0}"),
    (r"year (\S+) term (\S+): rows add up to (\d+) (\S+), the total line says (.*?)( - .*)?$",
     "ปี {0} ภาค {1}: รวมแถวได้ {2} ({3}) แต่บรรทัดรวมพิมพ์ {4}"),
    (r"hours not readable: (.*) \((.*)\)", "อ่านชั่วโมงไม่ได้: {0}"),
    (r"(.*) does not follow the credit rule", "{0} ไม่ตรงกฎหน่วยกิต (น = ท + ป/2 หรือ ป/3)"),
    (r"code not sure: the page reads (\S+), the code column reads (\S+)", "รหัสวิชาไม่แน่ใจ: ทั้งหน้าอ่านได้ {0} แต่คอลัมน์รหัสอ่านได้ {1}"),
    (r"code: the page reads (\S+), the code column reads (\S+)", "รหัสวิชา: ทั้งหน้าอ่านได้ {0} คอลัมน์รหัสอ่านได้ {1}"),
    (r"code not sure: (.*)", "รหัสวิชาไม่แน่ใจ: {0}"),
    (r"code: (.*)", "รหัสวิชา: {0}"),
]
FIELD = {"lecture": "ท", "lab": "ป", "credits": "น", "self_study": "ศึกษาเอง"}


def thai(reason):
    for pat, tpl in THAI:
        m = re.match(pat, reason)
        if m:
            out = tpl.format(*(FIELD.get(g, g) if g else "" for g in m.groups()))
            return out + (" · ผลรวมภาคก็ไม่ตรง" if "total does not add up" in reason and "ผลรวม" not in out else "")
    return reason


def grade_rows(result):
    """result = the engine's reading -> rows with grade + reasons, and the checks that belong to no row."""
    checks = result["checks"]
    rows, used = [], set()
    source = result["rows"] if result["rows"] else [
        {**s, "code": code, "plan": "", "year": 0, "term": 0, "order": i + 1}
        for i, (code, s) in enumerate(result["subjects"].items())]
    for i, r in enumerate(source):
        mine = [k for k, c in enumerate(checks) if c.get("code") == r["code"] and c.get("page") == r.get("page")]
        used.update(mine)
        levels = {checks[k]["level"] for k in mine}
        hours_known = None not in (r.get("lecture"), r.get("lab"), r.get("credits"))
        if "red" in levels:
            g = "fix"
        elif "amber" in levels:
            g = "check"
        elif r.get("kind") == "slot" or not hours_known:
            g = "unknown"
        else:
            g = "pass"
        reasons = [{"th": thai(checks[k]["reason"]), "en": checks[k]["reason"], "level": checks[k]["level"]} for k in mine]
        if g == "pass":
            reasons.append({"th": "อ่านได้ชัด หน่วยกิตตรงกฎ", "en": "read cleanly, the credit rule holds", "level": "ok"})
        if g == "unknown":
            reasons.append({"th": "วิชาเลือก/ช่องว่าง: ชั่วโมงกำหนดภายหลัง (ไม่ใช่ข้อผิดพลาด)",
                            "en": "an elective slot: hours decided later", "level": "info"})
        if r.get("total_ok") is True:
            reasons.append({"th": "ผลรวมภาคตรงกับที่พิมพ์", "en": "the term's printed total adds up", "level": "ok"})
        rows.append({"i": i, "plan": r.get("plan", ""), "year": r.get("year"), "term": r.get("term"), "order": r.get("order"),
                     "code": r["code"], "name_th": r.get("name_th", ""), "name_en": r.get("name_en", ""),
                     "kind": r.get("kind", "course"), "lecture": r.get("lecture"), "lab": r.get("lab"),
                     "self_study": r.get("self_study"), "credits": r.get("credits"), "field_hours": r.get("field_hours") or 0,
                     "choice": r.get("choice"), "group": r.get("group"), "page": r.get("page"),
                     "box": union(r.get("code_box"), r.get("credit_box")), "total_ok": r.get("total_ok"),
                     "grade": g, "reasons": reasons, "fixed": None})
    loose = [{"level": c["level"], "th": thai(c["reason"]), "en": c["reason"], "page": c.get("page")}
             for k, c in enumerate(checks) if k not in used]
    return rows, loose


def union(a, b):
    boxes = [x for x in (a, b) if x]
    if not boxes:
        return None
    return [min(x[0] for x in boxes), min(x[1] for x in boxes), max(x[2] for x in boxes), max(x[3] for x in boxes)]


def summary(rows, loose, pages):
    n = {g: sum(r["grade"] == g for r in rows) for g in GRADES}
    terms = {}
    for r in rows:
        if r["total_ok"] is not None:
            k = (r["plan"], r["year"], r["term"])
            terms[k] = terms.get(k, True) and r["total_ok"]
    usable = n["pass"] + n["fixed"] + n["unknown"]
    return {"rows": len(rows), **n, "usable_pct": round(100 * usable / len(rows), 1) if rows else 0,
            "totals_ok": sum(terms.values()), "totals_all": len(terms),
            "file_checks_red": sum(c["level"] == "red" for c in loose),
            "pages": len(pages), "pages_ocr": sum(p in ("ocr", "garbled-ocr") for p in pages.values())}


# ------------------------------------------------------------ a checked answer (only for known files, by SHA-256)
def compare(sha, rows):
    index_file = ANSWERS / "index.json"
    a = json.loads(index_file.read_text(encoding="utf-8")).get(sha) if index_file.exists() else None
    if not a:
        return None
    with open(ANSWERS / a["answer"], encoding="utf-8-sig") as f:
        want_rows = list(csv.DictReader(f))
    plan = lambda s: (re.search(r"\d{9}", re.sub(r"\s", "", s or "")) or [s])[0]
    key = (lambda r: (str(r["year"]), str(r["term"]), str(r["order"]), r["code"])) if a["key"] == "year_term_code" else \
          (lambda r: (plan(r["plan"]), str(r["year"]), str(r["term"]), str(r["order"]), r["code"]))
    num = lambda v: int(v) if str(v).strip().lstrip("-").isdigit() else None
    want = {}
    for r in want_rows:
        want.setdefault(key(r), (num(r.get("lecture")), num(r.get("lab")), num(r.get("credits"))))
    got = {}
    for r in rows:
        got.setdefault(key(r), (r["lecture"], r["lab"], r["credits"], r["grade"]))
    right = flagged = silent = 0
    for k, w in want.items():
        if k not in got:
            continue
        if got[k][:3] == w:
            right += 1
        elif got[k][3] in ("check", "fix", "unknown"):
            flagged += 1
        else:
            silent += 1
    return {"answer_file": a["answer"], "rows": len(want), "right": right, "wrong_flagged": flagged,
            "wrong_silent": silent, "missed": len(set(want) - set(got)), "extra": len(set(got) - set(want)),
            "right_pct": round(100 * right / len(want), 1) if want else None}


# ------------------------------------------------------------ export
COLUMNS = ["plan", "year", "term", "order", "code", "name_th", "name_en", "kind", "lecture", "lab", "self_study",
           "credits", "field_hours", "choice", "group", "page", "grade", "reasons", "fixed_by_person"]


def export_json(job):
    r = job["result"]
    return {"schema": SCHEMA,
            "file": {"name": job["file"], "sha256": job["sha"], "type": r["file_type"], "pages": r["summary"]["pages"]},
            "read": {"format": r["format"], "format_name": r["format_name"], "kind": r["kind"], "seconds": r["seconds"]},
            "grade": r["summary"], "answer": r["answer"],
            "rows": [{**{k: x[k] for k in COLUMNS[:16]}, "grade": x["grade"], "reasons": [y["th"] for y in x["reasons"]],
                      "fixed_by_person": x["fixed"]} for x in r["rows"]],
            "file_checks": r["file_checks"]}


def export_csv(job):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(COLUMNS)
    for x in job["result"]["rows"]:
        w.writerow([x[k] if x[k] is not None else "" for k in COLUMNS[:17]] +
                   [" | ".join(y["th"] for y in x["reasons"]),
                    json.dumps(x["fixed"]["before"], ensure_ascii=False) if x["fixed"] else ""])
    return "﻿" + out.getvalue()                      # BOM: Excel opens the Thai correctly
