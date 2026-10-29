"""The algorithm as its own service. The backend (FastAPI app) calls it over HTTP for the three heavy jobs; everything
cheap stays in the backend.

  GET  /health                       {"ok": true, "fet": "<FET version>"}
  POST /read?ocr=1&ext=.pdf          body = the file's bytes -> NDJSON stream, one JSON object per line:
                                       {"type":"event","what":..,"data":{..}}   progress (stage / page / format ...)
                                       {"type":"done","file_type":..,"got":{..}}  the reading (formats.read's result)
                                       {"type":"refused","message":..}            not a document we can read
                                       {"type":"error","message":..} / {"type":"cancelled"}
                                     closing the connection cancels the reading (OCR is killed at once)
  POST /fet/run?seed=1&time_limit=10 body = the FET input text -> {"status","placements":{id:[day,hour,room]},"message"}
                                     closing the connection stops FET at once
  POST /crop?page=3&y0=..&y1=..      body = a PDF -> PNG strip of that page (110 dpi)

Run: uvicorn service:app  (PYTHONPATH must hold this folder: importer, solver, timetable_core are its packages)
"""
import asyncio
import json
import queue
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from importer import formats, progress
from importer.convert import NotADocument, convert
from solver import fet

app = FastAPI(title="Timetable algorithm service")
reading = threading.Lock()          # importer.progress holds one global listener: one reading at a time


def line(obj):
    return json.dumps(obj, ensure_ascii=False, default=lambda o: sorted(o) if isinstance(o, (set, frozenset)) else str(o)) + "\n"


@app.get("/health")
def health():
    return {"ok": True, "fet": fet.version()}


@app.post("/read")
async def read(request: Request, ocr: bool = True, ext: str = ".bin"):
    data = await request.body()
    if not data:
        raise HTTPException(400, "empty body")
    out: "queue.Queue" = queue.Queue()
    stop = threading.Event()

    def work():
        with reading:
            def listener(what, d):
                if stop.is_set():
                    raise progress.Cancelled()
                if what != "check":
                    out.put({"type": "event", "what": what, "data": d})
            progress.listen(listener)
            progress.stop_when(stop.is_set)
            try:
                with tempfile.TemporaryDirectory() as tmp:
                    path = Path(tmp) / ("upload" + (ext if ext.startswith(".") else ".bin"))
                    path.write_bytes(data)
                    doc = convert(path, ocr=ocr)
                    got = formats.read(doc, path)
                    out.put({"type": "done", "file_type": doc.file_type, "got": got})
            except progress.Cancelled:
                out.put({"type": "cancelled"})
            except NotADocument as e:
                out.put({"type": "refused", "message": str(e)})
            except Exception as e:                     # the backend shows it; the service keeps running
                out.put({"type": "error", "message": "%s: %s" % (type(e).__name__, e)})
            finally:
                progress.listen(None)
                progress.stop_when(None)
                out.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        try:
            while (m := out.get()) is not None:
                yield line(m)
        finally:
            stop.set()                                  # the client went away (or we are done): stop the reading

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.post("/fet/run")
async def fet_run(request: Request, seed: int = 1, time_limit: int = 10):
    text = (await request.body()).decode("utf-8")
    stop, box = threading.Event(), {}

    def work():
        try:
            box["r"] = fet.run(text, seed, time_limit, cancelled=stop.is_set)
        except Exception as e:
            box["r"] = {"status": "failed", "placements": {}, "message": "%s: %s" % (type(e).__name__, e)}
    t = threading.Thread(target=work, daemon=True)
    t.start()
    try:
        while t.is_alive():
            if await request.is_disconnected():
                stop.set()
            await asyncio.sleep(0.1)
    finally:
        stop.set()
    return JSONResponse(box["r"])


@app.post("/crop")
async def crop(request: Request, page: int, y0: float, y1: float, dpi: int = 110, pad: int = 14):
    pdf = await request.body()
    if pdf[:4] != b"%PDF":
        raise HTTPException(400, "not a PDF")
    px = lambda v: int(v * dpi / 72)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.pdf"
        src.write_bytes(pdf)
        subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-f", str(page), "-l", str(page), "-singlefile",
                        "-y", str(max(0, px(y0 - pad))), "-H", str(px(y1 - y0 + 2 * pad)), "-x", "0", "-W", "1400",
                        str(src), str(Path(tmp) / "out")], check=True, timeout=60)
        return Response((Path(tmp) / "out.png").read_bytes(), media_type="image/png")
