"""GLYPH PASS: read codes and credits on SCANNED pages with the document's own font (measured in the planning
folder, 8-System-Effectiveness: 93% automatic, 0 wrong on 17 curricula; Thai digits 43% -> 72-80%).

Runs AFTER convert (which OCRs scan pages) and AFTER the format is known. Tesseract only found the words; this
pass decides what the code / credit words say:
  1 FIND    code-like words, credit-shaped words, junk inside the code column, and a credit-column probe on every
            code row where Tesseract boxed nothing
  2 LEARN   the font from copies trusted WITHOUT a text layer: confident Arabic words, rebuilt placeholders,
            N(x-x-x) credits (only the x), Thai credits (only the brackets), the document's own Arabic copy
  3 READ    every candidate with the learned symbols only
  4 DECIDE  shape, sure of every character, a taught symbol, credits add up, agrees with the rebuild / the copy /
            a Tesseract read that this document showed reliable -> the value; anything else -> word.doubt (red)
Never a guess: a doubted word keeps the text OCR gave and carries the reason.
"""
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

from PIL import Image

from timetable_core import normalise as nz
from timetable_core.document import Word
from . import glyphs as G

THAI = re.compile("[๐-๙]")
TO_THAI = str.maketrans("0123456789", "๐๑๒๓๔๕๖๗๘๙")
CREDIT_LIKE = re.compile(r"^\S{0,3}\(\S{1,4}-\S{1,4}-\S{1,4}\)?$")
CREDIT_PARTS = re.compile(r"([0-9]+)?\(([0-9]+)-([0-9]+)-([0-9]+)\)")
MARGIN, MAX_DIST, AGREE = 0.03, 0.35, 0.8


# ---------------------------------------------------------------- format facts
def canonical(v, fmt=None):
    v = "".join(nz.normalise(str(v), ocr=True).split()).rstrip("*#")
    if not re.search("[A-WYZa-wyz]", v):
        v = v.replace("X", "x")
    return v


def shape(v, fmt):
    for name in ("code", "placeholder", "credit"):
        if re.fullmatch(fmt[name], v):
            return name
    return None


def code_like(t):
    n = len(re.findall("[0-9๐-๙xX]", t))
    return len(t) >= 3 and n >= 3 and n * 2 >= len(t)


def credit_like(t):
    t = t.replace("–", "-")
    return bool(CREDIT_LIKE.match(t)) and len(t) <= 16


def breaks_rule(v):
    """Thai credit notation c(l-p-s): s = 2l + p/2 for 94% of 5,000 real credits. A break only FLAGS."""
    m = CREDIT_PARTS.fullmatch(canonical(v))
    if not m:
        return False
    l, p, s = int(m.group(2)), int(m.group(3)), int(m.group(4))
    return s not in (2 * l + p // 2, 2 * l + (p + 1) // 2)


def rebuild(after, fmt):
    """A placeholder from FACTS only: a slot word in the name + the format's group table."""
    name = nz.comparable(after)
    if not any(nz.comparable(w) in name for w in fmt.get("slot_words", [])):
        return None
    for keyword, template in fmt.get("groups", []):
        if nz.comparable(keyword) in name:
            return template
    return None


def looks_like(rb, read):
    v = canonical(read).lower() if read else ""
    group, lead = re.match("[0-9]*", rb).group(0), re.match("[0-9]*", v).group(0)
    rest = v[len(lead):].replace(".", "")
    if not rest or rest.count("x") < 0.6 * len(rest) or len(v) < 0.5 * len(rb):
        return False
    return lead == group or bool(group and lead and group.endswith(lead))


# ---------------------------------------------------------------- the pass
class Cand:
    def __init__(self, word, line, px, page):
        self.word, self.line, self.px, self.page = word, line, px, page
        self.after = " ".join(w.text for w in line.words if w.box[0] > word.box[2])[:120]
        self.pair = None


def render(path, page, dpi):
    with tempfile.TemporaryDirectory() as tmp:
        if Path(path).suffix.lower() != ".pdf" and Path(path).read_bytes()[:4] != b"%PDF":
            img = Image.open(path).convert("L")
        else:
            subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(dpi), "-gray", "-png",
                            "-singlefile", str(path), tmp + "/p"], capture_output=True)
            img = Image.open(tmp + "/p.png").convert("L")
        img.load()
    return img


def crop(img, px, dpi):
    pad = max(6, dpi // 25)
    x0, y0, x1, y1 = px
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def ink_box(img, box):
    x0, y0, x1, y1 = (max(0, box[0]), max(0, box[1]), min(img.width, box[2]), min(img.height, box[3]))
    if x1 <= x0 or y1 <= y0:
        return None
    bb = img.crop((x0, y0, x1, y1)).point(lambda v: 255 if v < 128 else 0).getbbox()
    if not bb or (bb[2] - bb[0]) * (bb[3] - bb[1]) < 20:
        return None
    return (x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])


def column_of(starts, tol):
    if len(starts) < 2:
        return None
    best = max(starts, key=lambda x: sum(abs(y - x) <= tol for y in starts))
    return best if sum(abs(y - best) <= tol for y in starts) >= 2 else None


def find(page, img, dpi, fmt):
    k = dpi / 72.0
    px = lambda b: tuple(int(v * k) for v in b)
    cands = []
    allw = [(w, line) for line in page.lines for w in line.words]
    starts = sorted(px(w.box)[0] for w, _ in allw if w.conf >= 80
                    and re.fullmatch(fmt["code"] + "|" + fmt["placeholder"], canonical(w.text)))
    col = column_of(starts, dpi * 0.06)
    creds = [px(w.box) for w, _ in allw if credit_like(w.raw) or credit_like(w.text)]
    band = (min(b[0] for b in creds) - dpi * 0.05, max(b[2] for b in creds) + dpi * 0.05) if len(creds) >= 2 else None
    for w, line in allw:
        b = px(w.box)
        in_col = col is not None and not code_like(w.text) and abs(b[0] - col) <= dpi * 0.06 and len(w.text) >= 3
        if code_like(w.text) or credit_like(w.raw) or credit_like(w.text) or in_col:
            cands.append(Cand(w, line, b, page.number))
    # ROW PROBE: a code row with no credit candidate -> cut that spot of the credit column out ourselves
    if band:
        for c in [c for c in cands if shape(canonical(c.word.text), fmt) in ("code", "placeholder") and c.px[2] < band[0]]:
            y0, y1 = c.px[1] - dpi * 0.02, c.px[3] + dpi * 0.02
            if any(band[0] <= (d.px[0] + d.px[2]) / 2 <= band[1] and y0 <= (d.px[1] + d.px[3]) / 2 <= y1 for d in cands):
                continue
            box = ink_box(img, (int(band[0]), int(y0), int(band[1]), int(y1)))
            if box:
                w = Word(raw="", text="", box=tuple(v / k for v in box), conf=0.0, source="ocr")
                c.line.words.append(w)
                c.line.words.sort(key=lambda v: v.box[0])
                cands.append(Cand(w, c.line, box, page.number))
    if fmt.get("paired_code_below"):
        for c in cands:
            if THAI.search(c.word.text):
                h = c.px[3] - c.px[1]
                below = [v for v, _ in allw if re.fullmatch("[0-9]{3}", v.text)
                         and h * 0.5 < px(v.box)[1] - c.px[1] < h * 3 and abs(px(v.box)[0] - c.px[0]) < dpi * 0.5]
                c.pair = below[0].text if len(below) == 1 else None
    return cands


def label(c, fmt):
    """What may be LEARNED from this word without a text layer: (label, only-these-symbols) or None."""
    t, conf = c.word.raw or c.word.text, c.word.conf
    v = canonical(t)
    if not THAI.search(t) and conf >= 90 and not nz.is_suspect(t) and shape(v, fmt) and not breaks_rule(v):
        return v, None
    if THAI.search(t) and c.pair and re.fullmatch("[๐-๙]{3}", t):
        if sum(a == b for a, b in zip(nz.normalise(t), c.pair)) >= 2:
            return c.pair.translate(TO_THAI), None
    rb = rebuild(c.after, fmt)
    if rb and not re.fullmatch("[0-9๐-๙]+", t):
        return rb, None
    if re.fullmatch(r"[0-9]+\(x-x-x\)", v) and conf >= 70:
        return v, {"x"}
    if re.fullmatch("[๐-๙]+\\([๐-๙]+-[๐-๙]+-[๐-๙]+\\)", t.replace("–", "-")):
        return t.replace("–", "-"), set("()-")
    return None


def decide(c, got, margin, worst, agree, fmt, ctx):
    t = c.word.raw or c.word.text
    v = canonical(got) if got else ""
    rb = rebuild(c.after, fmt)
    not_code = rb and not re.fullmatch(fmt["code"], canonical(t)) and not re.fullmatch(fmt["code"], v)
    if not_code and (looks_like(rb, got) or looks_like(rb, t)):
        return rb, ""
    if not_code and worst > MAX_DIST and abs(len(got) - len(rb)) <= 1:
        return rb, ""
    if not v:
        return None, "no characters found"
    s = shape(v, fmt)
    if not s:
        return None, "shape not valid for this format"
    if worst > MAX_DIST:
        return None, "a character unlike any symbol this document taught"
    if set(got) & ctx["disputed"] and agree < AGREE and not (rb and s == "placeholder"):
        return None, "the nearest learned examples disagree"
    m = re.match("^([ก-ฮ]{1,3})\\.", v)
    if m and any(ctx["prefixes"].get(m.group(1), 0) < 0.25 * ctx["prefixes"].get(m.group(1)[k:], 0)
                 for k in range(1, len(m.group(1)))):
        return None, "a letter of the previous word is glued on"
    need = MARGIN * (2 if s == "credit" and breaks_rule(v) else 1)
    if margin < need:
        return None, "not sure of a character"
    thai_doc = fmt.get("digits") == "thai"
    if s == "credit" and thai_doc and breaks_rule(v):
        return None, "credit does not add up"
    if rb and s == "placeholder" and rb != v:
        return None, "disagrees with the placeholder the slot name gives"
    if s == "code" and THAI.search(t) and c.pair:
        return (v, "") if v == c.pair else (None, "disagrees with the document's own Arabic copy")
    tv = canonical(t)
    if thai_doc and shape(tv, fmt) and tv != v and not (s == "credit" and breaks_rule(tv)):
        diff = [b for a, b in zip(v, tv) if a != b] if len(v) == len(tv) else ["?"]
        if not diff or not all(d in ctx["unreliable"] for d in diff) or margin < 2 * MARGIN:
            return None, "disagrees with the OCR read"
    if not THAI.search(t) and c.word.conf >= 90 and shape(tv, fmt) and tv != v:
        return None, "disagrees with a confident OCR read"
    return v, ""


def apply(doc, fmt, path, dpi=300):
    """Read every code / credit word on the scanned pages of `doc` with the document's own font. Changes the words
    in place; returns a summary {"scan_pages", "candidates", "accepted", "doubted", "symbols"}."""
    fmt = {k: v for k, v in fmt.items() if not k.startswith("_")}
    if fmt.get("glyph_pass") is False:                # the format says its tables are read by the cell pass instead
        return {"scan_pages": 0, "candidates": 0, "accepted": 0, "doubted": 0, "symbols": []}
    scan_pages = [p for p in doc.pages if p.kind == "scan" and p.lines]
    if not scan_pages:
        return {"scan_pages": 0, "candidates": 0, "accepted": 0, "doubted": 0, "symbols": []}
    font, unreliable, todo = G.Font(), set(), []
    for page in scan_pages:
        img = render(path, page.number, dpi)
        for c in find(page, img, dpi, fmt):
            c.img = crop(img, c.px, dpi)
            todo.append(c)
            lab = label(c, fmt)
            if lab:
                font.learn(c.img, lab[0], lab[1])
                tv = nz.normalise(c.word.raw)
                if lab[1] is None and THAI.search(c.word.raw) and len(tv) == len(nz.normalise(lab[0])):
                    unreliable |= {b for a, b in zip(nz.normalise(lab[0]), tv) if a != b}
    prefixes = Counter()
    for page in scan_pages:
        for line in page.lines:
            for w in line.words:
                m = re.match("^([ก-ฮ]{1,3})\\.", canonical(w.text))
                if m:
                    prefixes[m.group(1)] += 1
    ctx = {"disputed": font.disputed, "prefixes": prefixes, "unreliable": unreliable}
    accepted = doubted = 0
    for c in todo:
        got, margin, worst, agree = font.read(c.img)
        value, why = decide(c, got, margin, worst, agree, fmt, ctx)
        if value:
            c.word.text, c.word.source, c.word.doubt = value, "glyph", ""
            accepted += 1
        elif shape(canonical(c.word.text), fmt) or c.word.raw == "" or credit_like(c.word.raw):
            c.word.doubt = why                    # a value we would otherwise trust: say why it is not trusted
            doubted += 1
    return {"scan_pages": len(scan_pages), "candidates": len(todo), "accepted": accepted, "doubted": doubted,
            "symbols": sorted(font.ex)}
