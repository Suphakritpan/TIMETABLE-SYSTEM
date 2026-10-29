"""DEMO APP, part 1: INGEST. Upload a curriculum -> it is read while the page watches (stages, pages, formats) ->
every row graded with its reasons -> fix a value by hand -> export JSON / CSV for part 2 (the schedule engine).

  GET  /api/samples                  the sample files (buttons on the upload screen)
  POST /api/read                     upload a file -> a job id          POST /api/read/sample/{id}   the same, a sample
  GET  /api/jobs/{id}?since=n        status + the events after n (the live dashboard polls this) + the result when done
  PUT  /api/jobs/{id}/rows/{i}       a person fixes a row's values (kept as "fixed", with what it was)
  GET  /api/jobs/{id}/rows/{i}/crop  the piece of the page the row was read from (PNG)
  GET  /api/jobs/{id}/export.json    /export.csv

One reading at a time (a queue): OCR already uses every core. Jobs live in memory; files in DATA (a temp folder).
"""
import hashlib
import json
import os
import queue
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from importer import formats
from importer.reader import Reader

from . import algo, grade, schedule
from .algo import Cancelled, NotADocument

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("DEMO_DATA") or tempfile.mkdtemp(prefix="ingest-"))
SAMPLES = Path(os.environ.get("DEMO_SAMPLES", ROOT / "samples"))
MAX_UPLOAD = 20 * 1024 * 1024
BAD_FILE = {"the file is empty": "ไฟล์ว่าง", "password protected PDF": "PDF ใส่รหัสผ่าน", "a damaged PDF": "PDF เสีย",
            "a damaged office file": "ไฟล์ Office เสีย", "a zip file, not a document": "เป็นไฟล์ zip ไม่ใช่เอกสาร",
            "not a document type we can read": "ไม่ใช่ชนิดเอกสารที่อ่านได้ (PDF, Word, Excel, รูปภาพ)",
            "LibreOffice could not open it": "เปิดไฟล์ Office นี้ไม่ได้"}
FILE_TYPE = {"pdf-text": "PDF ข้อความ", "pdf-scan": "PDF สแกน", "pdf-mixed": "PDF ข้อความ + สแกน", "image": "รูปภาพ"}

app = FastAPI(title="Timetable demo - ingest")
jobs: dict = {}
todo: "queue.Queue[str]" = queue.Queue()


def event(job, what, **data):
    job["events"].append({"n": len(job["events"]), "t": round(time.time() - job["t0"], 2), "event": what, **data})


def work():
    while True:
        job = jobs[todo.get()]
        if job.get("cancel"):                            # cancelled while waiting in the queue
            continue
        job["status"], job["t0"] = "running", time.time()

        try:
            read(job)
            job["status"] = "done"
        except Cancelled:
            job["status"], job["error"] = "cancelled", "ยกเลิกแล้ว"
        except NotADocument as e:
            why = str(e)
            job["status"], job["error"] = "refused", why if job.get("status_note") else "อ่านไฟล์นี้ไม่ได้: %s" % BAD_FILE.get(why, why)
        except Exception as e:                            # the dashboard shows it; the server keeps running
            job["status"], job["error"] = "failed", "%s: %s" % (type(e).__name__, e)
        finally:
            event(job, "end", status=job["status"])


def read(job):
    path = Path(job["path"])
    file_type, got = algo.read(path, job["ocr"], lambda what, data: event(job, what, **data), lambda: bool(job.get("cancel")))
    job["file_type"] = file_type
    if got["format"] is None:
        job["status_note"] = "not_curriculum"
        raise NotADocument("ไม่ใช่หลักสูตร - ไม่พบแผนการเรียน และไม่พบรายวิชาที่มีชั่วโมง (ท-ป-น)")
    event(job, "stage", name="grade", state="start")
    defs = formats.shipped()
    job["fmt"] = got["format"]
    rows, loose = grade.grade_rows(got["result"])
    pages = {e["n"]: e["how"] for e in job["events"] if e["event"] == "page" and e["how"] != "cells"}
    job["result"] = {
        "format": got["format"], "format_name": formats.resolve(got["format"], defs).get("name", got["format"]),
        "kind": "course_list" if got.get("list_only") else "plan", "file_type": file_type,
        "file_type_th": FILE_TYPE.get(file_type, file_type), "scores": got["scores"],
        "rows": rows, "file_checks": loose, "summary": grade.summary(rows, loose, pages),
        "answer": grade.compare(job["sha"], rows), "seconds": round(time.time() - job["t0"], 1)}
    event(job, "stage", name="grade", state="done", **{k: job["result"]["summary"][k] for k in grade.GRADES})


threading.Thread(target=work, daemon=True).start()


def start(name, data, ocr=True):
    if not data:
        raise HTTPException(400, "ไฟล์ว่าง")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "ไฟล์ใหญ่เกิน 20 MB")
    jid = uuid.uuid4().hex[:12]
    folder = DATA / jid
    folder.mkdir(parents=True)
    path = folder / ("upload" + (Path(name).suffix.lower() or ".bin"))
    path.write_bytes(data)
    jobs[jid] = {"id": jid, "file": name, "sha": hashlib.sha256(data).hexdigest(), "path": str(path), "ocr": ocr,
                 "status": "queued", "events": [], "t0": time.time(), "result": None, "error": None,
                 "queued_behind": todo.qsize()}
    todo.put(jid)
    return {"id": jid}


def samples():
    listed = json.loads((ROOT / "config" / "samples.json").read_text(encoding="utf-8"))
    return [s for s in listed if (SAMPLES / s["path"]).exists()]


@app.get("/api/samples")
def sample_list():
    return samples()


@app.post("/api/read")
async def upload(file: UploadFile = File(...)):
    return start(file.filename or "upload", await file.read(MAX_UPLOAD + 1))


@app.post("/api/read/sample/{sample_id}")
def read_sample(sample_id: str):
    s = next((s for s in samples() if s["id"] == sample_id), None)
    if not s:
        raise HTTPException(404, "ไม่มีไฟล์ตัวอย่างนี้")
    return start(Path(s["path"]).name, (SAMPLES / s["path"]).read_bytes())


def job_of(jid):
    if jid not in jobs:
        raise HTTPException(404, "ไม่พบงานนี้ (เซิร์ฟเวอร์เริ่มใหม่แล้ว?)")
    return jobs[jid]


@app.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: str):
    j = job_of(jid)
    if j["status"] in ("queued", "running"):
        j["cancel"] = True
        if j["status"] == "queued":
            j["status"], j["error"] = "cancelled", "ยกเลิกแล้ว"
    return {"status": j["status"]}


@app.get("/api/jobs/{jid}")
def job_status(jid: str, since: int = 0):
    j = job_of(jid)
    return {k: j[k] for k in ("id", "file", "status", "error", "queued_behind")} | {
        "events": j["events"][since:], "result": j["result"] if j["status"] == "done" else None,
        "seconds": round(time.time() - j["t0"], 1) if j["status"] == "running" else None}


class Fix(BaseModel):
    lecture: Optional[int] = Field(None, ge=0, le=40)
    lab: Optional[int] = Field(None, ge=0, le=40)
    credits: Optional[int] = Field(None, ge=0, le=40)
    code: Optional[str] = Field(None, max_length=20)
    name_th: Optional[str] = Field(None, max_length=200)


@app.put("/api/jobs/{jid}/rows/{i}")
def fix_row(jid: str, i: int, body: Fix):
    j = job_of(jid)
    if not j["result"] or not 0 <= i < len(j["result"]["rows"]):
        raise HTTPException(404, "ไม่พบแถวนี้")
    r = j["result"]["rows"][i]
    change = body.model_dump(exclude_unset=True)
    before = (r["fixed"] or {}).get("before") or {k: r[k] for k in change}
    r.update(change)
    reader = Reader(formats.resolve(j["fmt"], formats.shipped()))
    ok = reader.credit_rule(r, r["kind"]) if reader.f.get("practice_per_credit") else None
    r["fixed"] = {"by": "person", "before": before, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    r["grade"] = "fixed" if ok is not False else "fix"
    r["reasons"] = [x for x in r["reasons"] if x["level"] != "person"] + [{
        "th": "แก้โดยคน: %s" % ", ".join("%s %s → %s" % (grade.FIELD.get(k, k), before.get(k), r[k]) for k in change)
              + ("" if ok is not False else " · แต่ยังไม่ตรงกฎหน่วยกิต"),
        "en": "fixed by a person", "level": "person"}]
    res = j["result"]
    res["summary"] = grade.summary(res["rows"], res["file_checks"],
                                   {e["n"]: e["how"] for e in j["events"] if e["event"] == "page" and e["how"] != "cells"})
    res["answer"] = grade.compare(j["sha"], res["rows"])
    return {"row": r, "summary": res["summary"], "answer": res["answer"]}


@app.get("/api/jobs/{jid}/rows/{i}/crop")
def crop(jid: str, i: int):
    """The strip of the page the row was read from (the full width of the page, around the row), 110 dpi."""
    j = job_of(jid)
    if not j["result"] or not 0 <= i < len(j["result"]["rows"]):
        raise HTTPException(404, "ไม่พบแถวนี้")
    r = j["result"]["rows"][i]
    path = Path(j["path"])
    if not r["box"] or not r["page"] or path.read_bytes()[:4] != b"%PDF":
        raise HTTPException(404, "ไม่มีภาพตัวอย่างสำหรับแถวนี้")
    out = path.parent / ("crop-%d.png" % i)
    if not out.exists():
        algo.crop(path, r["page"], r["box"][1], r["box"][3], out)
    return FileResponse(out, media_type="image/png")


@app.get("/api/jobs/{jid}/export.json")
def export_json(jid: str):
    j = job_of(jid)
    if not j["result"]:
        raise HTTPException(409, "ยังอ่านไม่เสร็จ")
    return JSONResponse(grade.export_json(j), headers=download(j, "json"))


@app.get("/api/jobs/{jid}/export.csv")
def export_csv(jid: str):
    j = job_of(jid)
    if not j["result"]:
        raise HTTPException(409, "ยังอ่านไม่เสร็จ")
    return Response(grade.export_csv(j), media_type="text/csv; charset=utf-8", headers=download(j, "csv"))


def download(job, ext):
    from urllib.parse import quote
    return {"Content-Disposition": "attachment; filename=\"ingest.%s\"; filename*=UTF-8''%s" % (ext, quote("%s.%s" % (Path(job["file"]).stem, ext)))}


# ============================================================ PART 2: SCHEDULE
sessions: dict = {}
solving = threading.Lock()                               # one FET run at a time


def rows_from_file(name, data):
    """Part 1's export: JSON (schema timetable-ingest/1) or its CSV."""
    if name.lower().endswith(".csv") or data[:3] == b"\xef\xbb\xbf" or data[:4] == b"plan":
        import csv
        import io
        num = lambda v: int(v) if str(v).strip().lstrip("-").isdigit() else None
        table = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
        missing = [c for c in ("plan", "year", "term", "code", "lecture", "lab", "credits") if c not in (table.fieldnames or [])]
        if missing:
            raise ValueError("ไม่มีคอลัมน์ %s (ดูแม่แบบ template.csv)" % ", ".join(missing))
        out, order = [], {}
        for r in table:
            if not (r.get("code") or "").strip():
                continue
            row = {**r, **{k: num(r.get(k)) for k in ("year", "term", "order", "lecture", "lab", "self_study",
                                                        "credits", "field_hours", "page")}}
            row["kind"] = (r.get("kind") or "").strip() or "course"     # a typed template: course unless it says so
            k = (row["plan"], row["year"], row["term"])
            order[k] = order.get(k, 0) + 1
            row["order"] = row["order"] or order[k]
            out.append(row)
        return out
    d = json.loads(data.decode("utf-8"))
    if d.get("schema") != grade.SCHEMA:
        raise ValueError("ไม่ใช่ไฟล์จากส่วนที่ 1 (schema %s)" % d.get("schema"))
    return d["rows"]


def new_session(rows, source):
    if not rows:
        raise HTTPException(400, "ไม่มีรายวิชาในไฟล์นี้")
    sid = uuid.uuid4().hex[:12]
    sessions[sid] = {"id": sid, **schedule.session_from_rows(rows, source)}
    return {"id": sid}


def sess(sid):
    if sid not in sessions:
        raise HTTPException(404, "ไม่พบงานจัดตารางนี้ (เซิร์ฟเวอร์เริ่มใหม่แล้ว?)")
    return sessions[sid]


@app.post("/api/sched/from-ingest/{jid}")
def from_ingest(jid: str):
    j = job_of(jid)
    if not j["result"]:
        raise HTTPException(409, "ส่วนที่ 1 ยังอ่านไม่เสร็จ")
    return new_session(grade.export_json(j)["rows"], j["file"])


@app.post("/api/sched/upload")
async def sched_upload(file: UploadFile = File(...)):
    try:
        rows = rows_from_file(file.filename or "", await file.read(MAX_UPLOAD + 1))
    except (ValueError, KeyError, UnicodeDecodeError) as e:
        raise HTTPException(400, "อ่านไฟล์นี้ไม่ได้: %s" % e)
    return new_session(rows, file.filename)


@app.get("/api/sched/{sid}")
def sched_state(sid: str):
    s = sess(sid)
    rows = s["rows"]
    return {"id": sid, "source": s["source"], "kind": s["kind"], "terms": s["terms"], "settings": s["settings"],
            "status": s["status"], "error": s.get("error"), "issues": s.get("issues", []), "teacher_file": teacher_summary(s),
            "input": {"rows": len(rows), "grades": {g: sum(r.get("grade") == g for r in rows) for g in grade.GRADES},
                      "fix": [{"code": r["code"], "name_th": r.get("name_th"), "term": r.get("term")} for r in rows if r.get("grade") == "fix"],
                      "per_term": {str(t): sum(r.get("term") == t for r in rows) for t in s["terms"]},
                      "subjects": [{k: r.get(k) for k in ("code", "name_th", "kind", "lecture", "lab", "credits", "choice", "grade")}
                                   for r in rows] if s["kind"] == "course_list" else []},
            "view": schedule.view(s), "runs": len(s["runs"])}


class SchedSettings(BaseModel):
    term: int = Field(1, ge=1, le=3)
    codes: list = Field(default_factory=list, max_length=300)
    groups: int = Field(1, ge=1, le=10)
    students: int = Field(30, ge=1, le=500)
    lecture_rooms: int = Field(6, ge=1, le=60)
    lab_rooms: int = Field(10, ge=0, le=60)
    days: list = Field(default_factory=lambda: list(schedule.SETTINGS["days"]), min_length=1, max_length=7)
    first: str = Field("08:00", pattern=r"^\d\d:00$")
    last: str = Field("17:00", pattern=r"^\d\d:00$")
    lunch: str = Field("flexible", pattern="^(flexible|fixed)$")
    flag: bool = True
    candidates: int = Field(5, ge=1, le=10)
    time_limit: int = Field(20, ge=1, le=120)
    include_fix: bool = False


@app.post("/api/sched/{sid}/run")
def sched_run(sid: str, body: SchedSettings):
    s = sess(sid)
    if s["status"] == "running":
        raise HTTPException(409, "กำลังจัดอยู่")
    if body.first >= body.last:
        raise HTTPException(400, "คาบแรกต้องก่อนคาบสุดท้าย")
    s["settings"] = body.model_dump()
    s["status"], s["events"], s["error"], s["t0"], s["cancel"] = "running", [], None, time.time(), False
    s["runs"].append({"n": len(s["runs"]) + 1, "at": time.strftime("%H:%M:%S")})

    def go():
        ev = lambda what, **data: s["events"].append({"n": len(s["events"]), "t": round(time.time() - s["t0"], 3),
                                                       "event": what, **data})
        try:
            with solving:
                r = schedule.run(s, ev)
            s["result"], s["status"] = r, r["status"]
            s["runs"][-1].update(status=r["status"])
        except Exception as e:
            s["status"], s["error"] = "error", str(e) if isinstance(e, ValueError) else "%s: %s" % (type(e).__name__, e)
        finally:
            ev("end", status=s["status"])
    threading.Thread(target=go, daemon=True).start()
    return {"run": len(s["runs"])}


@app.post("/api/sched/{sid}/cancel")
def sched_cancel(sid: str):
    s = sess(sid)
    if s["status"] == "running":
        s["cancel"] = True
    return {"status": s["status"]}


# ------------------------------------------------------------ the teacher file (made up for the tests: there are no
# teachers in a curriculum file); samples in <samples>/teachers/
def teacher_summary(s):
    f = s["teacher_file"]
    if not f:
        return None
    return {"file": f.get("file"), "teachers": len(f["teachers"]), "subjects": len(f["by_code"]), "issues": f["issues"],
            "names": sorted(f["teachers"]),
            "uncovered": sorted({r["code"] for r in s["rows"] if r.get("kind") == "course" and r["code"] not in f["by_code"]
                                 and "x" not in r["code"].lower()})[:50]}


def set_teacher_file(s, name, data):
    try:
        f = schedule.parse_teachers(data, s["rows"])
    except (ValueError, UnicodeDecodeError) as e:
        raise HTTPException(400, "อ่านไฟล์ครูไม่ได้: %s" % e)
    s["teacher_file"] = {**f, "file": name}
    return teacher_summary(s)


@app.get("/api/teacher-samples")              # not under /api/sched/: that path is a session id
def teacher_samples():
    folder = SAMPLES / "teachers"
    return sorted(p.name for p in folder.glob("*.csv")) if folder.exists() else []


@app.post("/api/sched/{sid}/teachers-file")
async def sched_teacher_file(sid: str, file: UploadFile = File(...)):
    return set_teacher_file(sess(sid), file.filename or "teachers.csv", await file.read(MAX_UPLOAD + 1))


@app.post("/api/sched/{sid}/teachers-file/sample/{name}")
def sched_teacher_sample(sid: str, name: str):
    if name not in teacher_samples():
        raise HTTPException(404, "ไม่มีไฟล์ครูตัวอย่างนี้")
    return set_teacher_file(sess(sid), name, (SAMPLES / "teachers" / name).read_bytes())


@app.delete("/api/sched/{sid}/teachers-file")
def sched_teacher_file_off(sid: str):
    sess(sid)["teacher_file"] = None
    return None


@app.get("/api/sched/{sid}/events")
def sched_events(sid: str, since: int = 0):
    s = sess(sid)
    done = s["status"] not in ("running",)
    return {"status": s["status"], "error": s.get("error"), "events": s["events"][since:],
            "result": s["result"] if done else None, "view": schedule.view(s) if done else None}


@app.get("/api/sched/{sid}/options/{key:path}")
def sched_options(sid: str, key: str):
    s = sess(sid)
    if not any(a["key"] == key for a in s["acts"]):
        raise HTTPException(404, "ไม่พบคาบนี้")
    return schedule.options(s, key)


class Move(BaseModel):
    key: str = Field(max_length=200)
    day: str = Field(max_length=20)
    hour: str = Field(max_length=5)


@app.post("/api/sched/{sid}/move")
def sched_move(sid: str, body: Move):
    s = sess(sid)
    if not any(a["key"] == body.key for a in s["acts"]):
        raise HTTPException(404, "ไม่พบคาบนี้")
    ok, why = schedule.move(s, body.key, body.day, body.hour)
    if not ok:
        raise HTTPException(409, why)
    return schedule.view(s)


class Pin(BaseModel):
    key: str = Field(max_length=200)
    pinned: bool


@app.post("/api/sched/{sid}/pin")
def sched_pin(sid: str, body: Pin):
    s = sess(sid)
    if body.key not in s["placed"]:
        raise HTTPException(409, "ปักหมุดได้เฉพาะคาบที่จัดแล้ว")
    (s["pinned"].add if body.pinned else s["pinned"].discard)(body.key)
    return schedule.view(s)


class Teachers(BaseModel):
    key: str = Field(max_length=200)
    names: list = Field(default_factory=list, max_length=5)


@app.put("/api/sched/{sid}/teachers")
def sched_teachers(sid: str, body: Teachers):
    s = sess(sid)
    names = [str(n).strip()[:80] for n in body.names if str(n).strip()]
    if names:
        s["teachers"][body.key] = names
    else:
        s["teachers"].pop(body.key, None)
    return schedule.view(s)


@app.get("/api/sched/{sid}/teacher")
def sched_teacher(sid: str, name: str):
    s = sess(sid)
    if not s["problem"]:
        raise HTTPException(409, "ยังไม่ได้จัดตาราง")
    return schedule.teacher_week(s, name)


@app.get("/api/sched/{sid}/export.json")
def sched_export_json(sid: str):
    s = sess(sid)
    if not s["problem"]:
        raise HTTPException(409, "ยังไม่ได้จัดตาราง")
    return JSONResponse(schedule.export_json(s), headers=download({"file": "timetable-" + Path(s["source"] or "x").stem}, "json"))


@app.get("/api/sched/{sid}/export.csv")
def sched_export_csv(sid: str):
    s = sess(sid)
    if not s["problem"]:
        raise HTTPException(409, "ยังไม่ได้จัดตาราง")
    return Response(schedule.export_csv(s), media_type="text/csv; charset=utf-8",
                    headers=download({"file": "timetable-" + Path(s["source"] or "x").stem}, "csv"))


if (ROOT / "web").is_dir():   # the page now lives in ../frontend; the old web/ is served only when present
    app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
