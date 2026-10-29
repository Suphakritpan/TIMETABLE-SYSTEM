"""How the backend reaches the algorithm (reading a curriculum, running FET, cropping a page).
ALGO_URL set   -> over HTTP to the algorithm service (docker compose: http://algorithm:8000)
ALGO_URL unset -> in this process (needs poppler, tesseract and FET installed: the old single-container way)
Same functions, same results either way."""
import json
import os
import threading
from pathlib import Path

import httpx

from importer.convert import NotADocument
from importer.progress import Cancelled

URL = os.environ.get("ALGO_URL", "").rstrip("/")
__all__ = ["read", "fet_run", "crop", "NotADocument", "Cancelled", "AlgoError"]


class AlgoError(RuntimeError):
    pass


def _watch(resp, cancelled):
    """Close the HTTP stream as soon as the person cancels: the service then stops OCR / FET at once."""
    done = threading.Event()

    def poll():
        while not done.wait(0.2):
            if cancelled():
                resp.close()
                return
    threading.Thread(target=poll, daemon=True).start()
    return done


def read(path, ocr, on_event, cancelled):
    """-> (file_type, got). on_event(what, data) gets the live progress. Raises NotADocument, Cancelled, AlgoError."""
    path = Path(path)
    if not URL:
        from importer import formats, progress
        from importer.convert import convert

        def listener(what, data):
            if cancelled():
                raise Cancelled()
            if what != "check":
                on_event(what, data)
        progress.listen(listener)
        progress.stop_when(cancelled)
        try:
            doc = convert(path, ocr=ocr)
            return doc.file_type, formats.read(doc, path)
        finally:
            progress.listen(None)
            progress.stop_when(None)
    try:
        with httpx.Client(timeout=httpx.Timeout(None, connect=10)) as c, \
                c.stream("POST", URL + "/read", params={"ocr": ocr, "ext": path.suffix.lower() or ".bin"},
                         content=path.read_bytes()) as r:
            if r.status_code != 200:
                raise AlgoError("algorithm service answered %d" % r.status_code)
            done = _watch(r, cancelled)
            try:
                for text in r.iter_lines():
                    if cancelled():
                        raise Cancelled()
                    if not text:
                        continue
                    m = json.loads(text)
                    t = m["type"]
                    if t == "event":
                        on_event(m["what"], m["data"])
                    elif t == "done":
                        return m["file_type"], m["got"]
                    elif t == "refused":
                        raise NotADocument(m["message"])
                    elif t == "cancelled":
                        raise Cancelled()
                    else:
                        raise AlgoError(m.get("message", "error"))
                raise Cancelled() if cancelled() else AlgoError("the reading ended without a result")
            except httpx.HTTPError:
                if cancelled():
                    raise Cancelled()
                raise
            finally:
                done.set()
    except httpx.HTTPError as e:
        raise AlgoError("cannot reach the algorithm service: %s" % e)


def fet_run(text, seed, time_limit, cancelled):
    """Same result as solver.fet.run: {status, placements: {activity id: (day, hour, room)}, message}."""
    if not URL:
        from solver import fet
        return fet.run(text, seed, time_limit, cancelled=cancelled)
    try:
        with httpx.Client(timeout=httpx.Timeout(None, connect=10)) as c, \
                c.stream("POST", URL + "/fet/run", params={"seed": seed, "time_limit": time_limit},
                         content=text.encode("utf-8")) as r:
            done = _watch(r, cancelled)
            try:
                if r.status_code != 200:
                    raise AlgoError("algorithm service answered %d" % r.status_code)
                res = json.loads(r.read())
            except httpx.HTTPError:
                if cancelled():
                    return {"status": "cancelled", "placements": {}, "message": "cancelled"}
                raise
            finally:
                done.set()
    except httpx.HTTPError as e:
        raise AlgoError("cannot reach the algorithm service: %s" % e)
    res["placements"] = {int(k): tuple(v) for k, v in res["placements"].items()}
    return res


def crop(pdf_path, page, y0, y1, out, dpi=110, pad=14):
    """Write the PNG strip of a PDF page (the full width, y0..y1 in points, plus pad) to `out`."""
    if not URL:
        import subprocess
        px = lambda v: int(v * dpi / 72)
        subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-f", str(page), "-l", str(page), "-singlefile",
                        "-y", str(max(0, px(y0 - pad))), "-H", str(px(y1 - y0 + 2 * pad)), "-x", "0", "-W", "1400",
                        str(pdf_path), str(Path(out).with_suffix(""))], check=True, timeout=60)
        return
    try:
        r = httpx.post(URL + "/crop", params={"page": page, "y0": y0, "y1": y1, "dpi": dpi, "pad": pad},
                       content=Path(pdf_path).read_bytes(), timeout=90)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise AlgoError("cannot reach the algorithm service: %s" % e)
    Path(out).write_bytes(r.content)
