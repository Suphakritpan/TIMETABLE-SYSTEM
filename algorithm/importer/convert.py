"""Layer 1 - CONVERT: any curriculum file -> Document (pages -> lines -> words with boxes), then NORMALISE.

What it is is decided by content, never by the file name (benchmark: a photo named .pdf, a zip named .docx).
  PDF with text  -> pdftotext -bbox (each word + box); pages without text -> OCR (Tesseract, Thai + English)
  Word / ODT     -> LibreOffice -> PDF -> as above (keeps page numbers for "show me where")
  image          -> OCR
Measured rules (8-System-Effectiveness): OCR one job per page, 1 thread each; 200 dpi for pages WITH text,
300 dpi for scans; never trust OCR's Thai digits or placeholders without the glyph tool's checks.
"""
import csv
import hashlib
import html
import os
import re
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

from timetable_core import normalise as nz
from timetable_core.document import Document, Line, Page, Word

SCAN_MIN_CHARS = 50
ONE_THREAD = {**os.environ, "OMP_THREAD_LIMIT": "1"}


class NotADocument(Exception):
    """The file cannot be read (empty, broken, locked, not a document) - the reason is in the message."""


def run(cmd, timeout=300, env=None):
    """An outside program (pdftotext, tesseract, LibreOffice). Stopped at once when the reading is cancelled."""
    from . import progress
    if progress._stop is None:                        # nobody can cancel (command line, tests): the plain way
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, p.stdout, p.stderr
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    end = time.monotonic() + timeout
    while True:
        try:
            out, err = p.communicate(timeout=0.2)
            return p.returncode, out, err
        except subprocess.TimeoutExpired:
            if progress.cancelled():
                p.kill()
                p.communicate()
                raise progress.Cancelled()
            if time.monotonic() > end:
                p.kill()
                p.communicate()
                raise subprocess.TimeoutExpired(cmd, timeout)



# ---------------------------------------------------------------- what is it?

def detect(path):
    head = Path(path).read_bytes()[:8]
    if not head:
        raise NotADocument("the file is empty")
    if head.startswith(b"%PDF"):
        code, out, err = run(["pdfinfo", str(path)])
        if code != 0:
            raise NotADocument("password protected PDF" if "password" in err.lower() else "a damaged PDF")
        return "pdf"
    if head.startswith(b"PK\x03\x04"):
        try:
            names = set(zipfile.ZipFile(path).namelist())
        except zipfile.BadZipFile:
            raise NotADocument("a damaged office file")
        if any(n.startswith("word/") for n in names) or "content.xml" in names:
            return "office"
        raise NotADocument("a zip file, not a document")
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "office"                                   # old .doc
    if head[:3] == b"\xff\xd8\xff" or head.startswith(b"\x89PNG") or head[:4] in (b"II*\x00", b"MM\x00*"):
        return "image"
    raise NotADocument("not a document type we can read")


# ---------------------------------------------------------------- words -> lines

def to_lines(page_no, words, slope=0.0):
    """Group words into lines by their vertical centre (tables: a code, its name and its credit become one line).
    slope = the page's tilt (dy per dx): on a scan turned 1.5 degrees, a credit 20 cm to the right of its code
    sits millimetres lower - grouping follows the slope, not a flat line."""
    level = lambda w: (w.box[1] + w.box[3]) / 2 - slope * w.box[0]
    words = sorted(words, key=lambda w: (level(w), w.box[0]))
    lines, cur, cur_y, cur_h = [], [], None, 0
    for w in words:
        cy, h = level(w), w.box[3] - w.box[1]
        if cur and abs(cy - cur_y) > max(cur_h, h) * 0.45:
            lines.append(Line(page_no, sorted(cur, key=lambda v: v.box[0])))
            cur = []
        if not cur:
            cur_y, cur_h = cy, h
        cur.append(w)
    if cur:
        lines.append(Line(page_no, sorted(cur, key=lambda v: v.box[0])))
    return lines


def word(raw, box, conf=100.0, source="text", ocr=False):
    return Word(raw=raw, text=nz.normalise(raw, ocr=ocr), box=box, conf=conf, source=source)


# ---------------------------------------------------------------- PDF

def pdf_text_pages(pdf):
    code, out, err = run(["pdftotext", "-bbox", str(pdf), "-"], timeout=600)
    pages = []
    for pm in re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', out, re.S):
        ws = [word(html.unescape(m.group(5)), tuple(float(m.group(i)) for i in range(1, 5)))
              for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>',
                                   pm.group(3))]
        pages.append((float(pm.group(1)), float(pm.group(2)), ws))
    return pages


def ocr_page(pdf_or_image, page_no, dpi, width_pt=None):
    """Tesseract words with confidence; boxes converted back to points."""
    with tempfile.TemporaryDirectory() as tmp:
        img = Path(pdf_or_image)
        if img.suffix.lower() == ".pdf" or detect(pdf_or_image) == "pdf":
            run(["pdftoppm", "-f", str(page_no), "-l", str(page_no), "-r", str(dpi), "-gray", "-png", "-singlefile",
                 str(pdf_or_image), tmp + "/p"])
            img = Path(tmp + "/p.png")
        code, out, err = run(["tesseract", str(img), "stdout", "-l", "tha+eng", "tsv"], env=ONE_THREAD)
    # Tesseract gives Thai text LETTER BY LETTER: join letters into words by the gap between them
    k = 72.0 / dpi
    lines = {}
    for r in csv.DictReader(out.splitlines(), delimiter="\t", quoting=csv.QUOTE_NONE):
        if r.get("level") == "5" and (r.get("text") or "").strip():
            lines.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
    ws, slopes = [], []
    for chars in lines.values():
        chars.sort(key=lambda r: int(r["left"]))
        if len(chars) >= 10:                          # the tilt: how the letters' centres drift along one line
            xs = [int(c["left"]) + int(c["width"]) / 2 for c in chars]
            ys = [int(c["top"]) + int(c["height"]) for c in chars]       # bottoms: steadier than centres in Thai
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            den = sum((x - mx) ** 2 for x in xs)
            if den > 0:
                slopes.append(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den)
        groups = [[chars[0]]]
        for c in chars[1:]:
            p = groups[-1][-1]
            if int(c["left"]) - (int(p["left"]) + int(p["width"])) > dpi * 0.08:
                groups.append([c])
            else:
                groups[-1].append(c)
        for g in groups:
            x0 = min(int(c["left"]) for c in g); y0 = min(int(c["top"]) for c in g)
            x1 = max(int(c["left"]) + int(c["width"]) for c in g); y1 = max(int(c["top"]) + int(c["height"]) for c in g)
            ws.append(word("".join(c["text"] for c in g), (x0 * k, y0 * k, x1 * k, y1 * k),
                           min(float(c["conf"]) for c in g), "ocr", ocr=True))
    slopes.sort()
    return ws, (slopes[len(slopes) // 2] if slopes else 0.0)


GARBLE_MARKS = re.compile(r"[\^~`'\"\\{}|<>\[\]_]")


def garbled(ws):
    """A text layer that cannot be read: old non-Unicode Thai fonts give Latin junk ("aa'i'uunTsa'i^Q^n'tei").
    Measured: such pages have NO Thai letter and 5-9 % of these marks; real Thai or English pages have 0 %.
    Such a page is read with OCR, like a scan."""
    text = "".join(x.raw for x in ws).replace(" ", "")
    if len(text) < 200 or re.search("[ก-๛]", text):
        return False
    return len(GARBLE_MARKS.findall(text)) / len(text) >= 0.02


def convert(path, ocr_dpi_scan=300, ocr=True):
    """ocr=False: pages without text are kept empty (kind "scan") instead of being read - fast, for tests."""
    from .progress import report
    path = Path(path)
    report("stage", name="check", state="start")
    kind = detect(path)
    report("stage", name="check", state="done", kind=kind)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory() as tmp:
        if kind == "office":
            report("stage", name="office", state="start")
            code, out, err = run(["soffice", "-env:UserInstallation=file://" + tmp + "/lo", "--headless",
                                  "--convert-to", "pdf", "--outdir", tmp, str(path)], timeout=300)
            made = list(Path(tmp).glob("*.pdf"))
            if not made:
                raise NotADocument("LibreOffice could not open it")
            path, kind = made[0], "pdf"
        if kind == "image":
            report("pages", total=1, ocr=[1], garbled=[])
            ws, slope = ocr_page(path, 1, ocr_dpi_scan)
            report("page", n=1, how="ocr", words=len(ws))
            return Document([Page(1, 0, 0, "scan", to_lines(1, ws, slope))], "image", "tesseract + normalise", sha)
        report("stage", name="text", state="start")
        text_pages = pdf_text_pages(path)
        bad = [i for i, (w, h, ws) in enumerate(text_pages, 1) if garbled(ws)]
        need = [i for i, (w, h, ws) in enumerate(text_pages, 1)
                if sum(len(x.raw.strip()) for x in ws) < SCAN_MIN_CHARS or i in bad]
        report("pages", total=len(text_pages), ocr=need, garbled=bad)
        for i, (w, h, ws) in enumerate(text_pages, 1):
            if i not in need:
                report("page", n=i, how="text", words=len(ws))
        report("stage", name="text", state="done")
        read = {}
        if ocr and need:                  # one OCR job per page, all cores at once (measured: 5.8 -> 1.5 s per page)
            from concurrent.futures import ThreadPoolExecutor
            report("stage", name="ocr", state="start", pages=len(need))

            def one(i):
                report("check")                       # cancelled? stop before the next page, not after all of them
                got = ocr_page(path, i, ocr_dpi_scan)
                report("page", n=i, how="garbled-ocr" if i in bad else "ocr", words=len(got[0]))
                return got
            with ThreadPoolExecutor(max_workers=os.cpu_count() or 1) as pool:
                read = dict(zip(need, pool.map(one, need)))
            report("stage", name="ocr", state="done")
        pages, n_scan = [], 0
        for i, (w, h, ws) in enumerate(text_pages, 1):
            slope = 0.0
            if i in need:
                ws, slope = read.get(i, ([], 0.0))
                pk = "scan" if (ws or not ocr) else "blank"
                n_scan += pk == "scan"
            else:
                pk = "text"
            pages.append(Page(i, w, h, pk, to_lines(i, ws, slope)))
    ft = "pdf-text" if not n_scan else ("pdf-scan" if n_scan == len(pages) else "pdf-mixed")
    return Document(pages, ft, "pdftotext + tesseract + normalise", sha)
