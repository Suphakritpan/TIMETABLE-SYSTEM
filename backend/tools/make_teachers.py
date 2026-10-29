"""MADE-UP teachers for the test files (a curriculum file has no teachers; user, 2026-10-29: "make up one").
For each of the 3 rubric files (CED, TATC, Chula) it writes <samples>/teachers/<name>-teachers.csv:
  teacher, subjects (codes), unavailable ("จันทร์ 08:00-12:00; ..."), max_hours_day
Every subject gets one teacher; a teacher takes subjects until about 12 hours a week in a term; some teachers
cannot teach a half-day or two; most may teach 6 hours a day, some 4. Fixed random seed: the same files every time.
Run on the host:  python3 tools/make_teachers.py        (reads the saved readings in reports/cache)
"""
import csv
import hashlib
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
FILES = {"ced": ("university/CED KMUTNB ค.อ.บ. (text).pdf", "อ."),
         "tatc": ("vocational/แผนการเรียน สัตหีบ TATC ปวส. (scan).pdf", "ครู"),
         "chula": ("university/chula_polsci-political-science_2564.pdf", "อ.")}
FIRST = ["สมชาย", "สมหญิง", "วิชัย", "มาลี", "ประเสริฐ", "สุดา", "อนันต์", "กมล", "ศรีสุดา", "ธนา", "ปรีชา", "วันดี",
         "สุรชัย", "นภา", "ชัยวัฒน์", "รัตนา", "เกียรติ", "พรทิพย์", "อำนาจ", "จันทร์เพ็ญ", "บุญมี", "อรุณี", "ไพโรจน์", "ลำดวน"]
LAST = ["ใจดี", "รักเรียน", "สอนดี", "มีสุข", "ทองคำ", "แก้วใส", "ศรีงาม", "บุญมา", "พูนผล", "ดวงแก้ว", "สายทอง", "รุ่งเรือง"]
DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"]
LOAD = 12                                               # hours a week in a term (one group a year)


def reading(path):
    sha = hashlib.sha256((SAMPLES / path).read_bytes()).hexdigest()[:16]
    for f in sorted((ROOT / "reports" / "cache").glob(sha + "-*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        k = json.loads(f.read_text(encoding="utf-8"))
        if "export" in k:
            return k["export"]["rows"]
    raise SystemExit("no saved reading of %s: run the rubric test once first" % path)


def make(key, path, title):
    rows = [r for r in reading(path) if r["kind"] == "course" and "x" not in r["code"].lower()
            and (r.get("lecture") or 0) + (r.get("lab") or 0) > 0 and not r.get("field_hours")]
    # a subject's hours a week in each term = its hours x the study plans / years that have it in that term
    load = {}
    for r in rows:
        load.setdefault(r["code"], {}).setdefault(r["term"], set()).add((r["plan"], r["year"]))
    hours = {r["code"]: (r.get("lecture") or 0) + (r.get("lab") or 0) for r in rows}
    block = {r["code"]: max(r.get("lecture") or 0, r.get("lab") or 0) for r in rows}     # the longest class of a subject
    rnd = random.Random(key)
    names = ["%s%s %s" % (title, f, l) for l in LAST for f in FIRST]
    rnd.shuffle(names)
    teachers = []                                       # [name, [codes], {term: hours}]
    for code in dict.fromkeys(r["code"] for r in rows):
        need = {t: hours[code] * len(p) for t, p in load[code].items()}
        t = next((t for t in teachers if all(t[2].get(k, 0) + v <= LOAD for k, v in need.items())), None)
        if t is None:
            t = [names[len(teachers)], [], {}]
            teachers.append(t)
        t[1].append(code)
        for k, v in need.items():
            t[2][k] = t[2].get(k, 0) + v
    out = SAMPLES / "teachers" / ("%s-teachers.csv" % key)
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["teacher", "subjects", "unavailable", "max_hours_day"])
        for name, codes, _ in teachers:
            off = []
            for _ in range(rnd.choice([0, 0, 1, 1, 2])):          # some teachers cannot teach a half-day or two
                d = rnd.choice(DAYS)
                off.append("%s 08:00-12:00" % d if rnd.random() < 0.5 else "%s 13:00-17:00" % d)
            # never below the teacher's longest class: a 6-hour practice block needs a 6-hour day (the pre-check
            # caught the first version: "may teach at most 4 hours a day, but has a 6-hour block")
            w.writerow([name, " ".join(codes), "; ".join(sorted(set(off))), max(rnd.choice([6, 6, 6, 4]), *(block[c] for c in codes))])
    print("%s: %d teachers for %d subjects -> %s" % (key, len(teachers), len({r['code'] for r in rows}), out))


if __name__ == "__main__":
    for key, (path, title) in FILES.items():
        make(key, path, title)
    (SAMPLES / "teachers" / "README.txt").write_text(
        "MADE-UP TEACHERS for testing (a curriculum has no teachers). Not real people.\n"
        "Made by timetable/tools/make_teachers.py from the 3 rubric files: CED, TATC, Chula.\n"
        "Columns: teacher, subjects (codes), unavailable (จันทร์ 08:00-12:00; ...), max_hours_day\n", encoding="utf-8")
