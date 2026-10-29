"""CELL PASS: read the columns of a ruled plan table again, on scanned pages.

Whole-page OCR reads table lines as digits and brackets ("3|0|3" -> "310] 3"), drops narrow digits, and sometimes
loses a whole code ("30102-2055" -> "เวตอ"). Here the table's own vertical lines are found in the image; the code
column and each narrow hours column (vocational ท ป น) are cut out INSIDE their lines and read again (digits only).
  - a code found in the code column where the page OCR has none becomes a row (nothing is lost silently)
  - the hours of every row, and of every term-total line, come from their own cells
  - a row's cell reading that breaks the format's credit rule is dropped when the page OCR has ONE reading that fits
New words have source "cell"; the reader checks everything as always (rule, term totals), red when unsure.
Only for formats with credit_columns; pages with a real text layer are not touched.
"""
import collections
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

from timetable_core import normalise as nz
from timetable_core.document import Word

DPI = 300


def render(pdf, page_no, dpi=DPI):
    from PIL import Image
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-f", str(page_no), "-l", str(page_no), "-r", str(dpi), "-gray", "-png",
                        "-singlefile", str(pdf), tmp + "/p"], capture_output=True)
        img = Image.open(tmp + "/p.png").convert("L")
        img.load()
    return img


def vertical_lines(img, y0, y1):
    """x positions (pixels) of the table's vertical rules between heights y0 and y1: columns that stay dark
    almost all the way down (averaged to one pixel row, so it is fast)."""
    from PIL import Image
    strip = img.crop((0, max(0, y0), img.width, min(img.height, y1))).resize((img.width, 1), Image.BOX)
    dark = [x for x, v in enumerate(strip.getdata()) if v < 150]
    lines, run = [], []
    for x in dark:
        if run and x - run[-1] > 3:
            lines.append(sum(run) / len(run))
            run = []
        run.append(x)
    if run:
        lines.append(sum(run) / len(run))
    return lines


def read_column(img, x0, x1, y0, y1, chars="0123456789"):
    """What is written in one column strip, with heights: [(y centre in pixels, text)]. The strip is scaled up and
    given a white margin (tight crops make Tesseract read 3 as 5)."""
    from PIL import Image, ImageOps
    with tempfile.TemporaryDirectory() as tmp:
        cell = img.crop((x0, y0, x1, y1))
        cell = ImageOps.expand(cell.resize((cell.width * 2, cell.height * 2), Image.LANCZOS), border=30, fill=255)
        cell.save(tmp + "/c.png")
        out = subprocess.run(["tesseract", tmp + "/c.png", "stdout", "--psm", "6", "-l", "eng",
                              "-c", "tessedit_char_whitelist=" + chars, "tsv"],
                             capture_output=True, text=True, env={**os.environ, "OMP_THREAD_LIMIT": "1"}).stdout
    found = []
    for row in out.splitlines()[1:]:
        f = row.split("\t")
        if len(f) == 12 and f[0] == "5" and f[11].strip():
            found.append((y0 + (int(f[7]) - 30 + int(f[9]) / 2) / 2, f[11].strip()))   # back from x2 + margin
    return found


def skew(points):
    """How much a column drifts sideways per pixel down (dx / dy) on a tilted scan, from the left edges of the codes
    of one column; 0 when there are too few to tell."""
    if len(points) < 4:
        return 0.0
    my = sum(y for _, y in points) / len(points)
    mx = sum(x for x, _ in points) / len(points)
    den = sum((y - my) ** 2 for _, y in points)
    return sum((x - mx) * (y - my) for x, y in points) / den if den else 0.0


def straighten(img, s):
    """Shear the page so that its tilted vertical lines stand straight: a point (x, y) moves to (x - s*y, y)."""
    from PIL import Image
    if abs(s) < 0.0005:
        return img
    return img.transform(img.size, Image.AFFINE, (1, s, 0, 0, 1, 0), resample=Image.BICUBIC, fillcolor=255)


def tables(rules, width, n):
    """Each table on the page as {code, name: (x0, x1), hours: [(x0, x1) x n]}: n narrow columns that follow the
    wide name column, which follows the code column. A faint line the scan lost inside the hours columns shows as
    one cell twice the usual width: it is counted as two (the line goes back in its middle)."""
    narrow = 0.06 * width
    gaps = [b - a for a, b in zip(rules, rules[1:])]
    small = sorted(g for g in gaps if 8 < g < narrow)
    cell = small[len(small) // 2] if small else narrow
    out = []
    for i in range(2, len(rules) - 1):
        if rules[i] - rules[i - 1] <= narrow:
            continue                                  # not a name column
        hours, j = [], i
        while len(hours) < n and j + 1 < len(rules):
            g = rules[j + 1] - rules[j]
            if 0.6 * cell < g < 1.4 * cell:
                hours.append((rules[j], rules[j + 1]))
            elif 1.7 * cell < g < 2.3 * cell and len(hours) + 2 <= n:
                mid = (rules[j] + rules[j + 1]) / 2
                hours += [(rules[j], mid), (mid, rules[j + 1])]
            else:
                break
            j += 1
        if len(hours) == n:
            out.append({"code": (rules[i - 2], rules[i - 1]), "name": (rules[i - 1], rules[i]), "hours": hours})
    return out


def apply(doc, fmt, pdf, dpi=DPI):
    """Returns {"pages", "rows", "found", "totals"}: pages read again, rows whose hours came from cells, rows found
    only in the code column, term-total lines read from cells."""
    cols = fmt.get("credit_columns")
    pages = [p for p in doc.pages if p.kind == "scan"] if cols and pdf else []
    if not pages:
        return {"pages": 0, "rows": 0, "found": 0, "totals": 0}
    # every code the page OCR read in the whole document: a second source for a code read two ways
    marks = re.escape(fmt.get("border_marks", ""))
    code_re = re.compile("^[%s]*(%s)" % (marks, fmt["code"].strip("^$")))
    elsewhere = collections.Counter(code_re.match(w.text).group(1) for p in doc.pages for l in p.lines
                                    for w in l.words if code_re.match(w.text))
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 1) as pool:      # one page per core
        from .progress import report

        def one(p):
            report("check")                           # cancelled? stop before the next page
            got = page_pass(p, fmt, pdf, dpi, elsewhere)
            report("page", n=p.number, how="cells", rows=got["rows"])
            return got
        done = list(pool.map(one, pages))
    return {k: sum(d[k] for d in done) for k in ("pages", "rows", "found", "totals")}


def page_pass(page, fmt, pdf, dpi, elsewhere=None):
    from .reader import Reader
    reader = Reader(fmt)
    cols = fmt["credit_columns"]
    marks = re.escape(fmt.get("border_marks", ""))
    core = fmt["code"].strip("^$")
    code_re = re.compile("^[%s]*(%s)" % (marks, core))
    loose = re.compile("^" + core.replace("-", "-?") + "$")       # a code column read without its dash
    total_re = re.compile(fmt.get("total", "(?!)"))
    k = dpi / 72.0
    elsewhere = elsewhere if elsewhere is not None else collections.Counter()
    stats = {"pages": 0, "rows": 0, "found": 0, "totals": 0}
    words = [(line, w) for line in page.lines for w in line.words]
    coded = [(line, w) for line, w in words if code_re.match(w.text)]
    totals = [(line, w) for line, w in words if total_re.match(nz.comparable(w.text))]
    if not coded:
        return stats
    img = render(pdf, page.number, dpi)
    # a tilted scan: measure the drift of the code column (the codes nearest the left edge), then straighten the
    # page; every word position below is moved the same way with X()
    left = [w for _, w in coded if w.box[0] * k < img.width / 3]
    sk = skew([(w.box[0] * k, (w.box[1] + w.box[3]) / 2 * k) for w in left])
    img = straighten(img, sk)
    X = lambda x, y: x * k - sk * y * k                          # word point (pt) -> straightened pixels
    cx = lambda w: X((w.box[0] + w.box[2]) / 2, (w.box[1] + w.box[3]) / 2)
    # the table's lines are found where its rows are (they may break before the total rows); the columns are then
    # read down to the totals
    rows_y = [v * k for _, w in coded for v in (w.box[1], w.box[3])]
    found = tables(vertical_lines(img, int(min(rows_y)) - 25, int(max(rows_y)) + 25), img.width, len(cols))
    ys = rows_y + [v * k for _, w in totals for v in (w.box[1], w.box[3])]
    y_top, y_bottom = int(min(ys)) - 25, int(max(ys)) + 25
    if not found:
        return stats
    stats["pages"] = 1
    row_h = sorted(w.box[3] - w.box[1] for _, w in coded)[len(coded) // 2] * k     # a typical row height (px)
    inside = lambda w, span: span[0] <= cx(w) <= span[1]
    for tb in found:
        reads = []
        for a, b in tb["hours"]:
            pad = max(3, (b - a) * 0.12)
            reads.append(read_column(img, int(a + pad), int(b - pad), y_top, y_bottom))
        a, b = tb["code"]
        codes = [(y, t) for y, t in read_column(img, int(a + 4), int(b - 4), y_top, y_bottom, "0123456789-")
                 if loose.match(t)]
        # a code word belongs to this table by where it STARTS (OCR glues "30000-1305|วิทยาศาสตร์..." into one word)
        mine = [(line, w) for line, w in coded if a - 16 <= X(w.box[0], (w.box[1] + w.box[3]) / 2) <= b]
        # crumbs stuck to the end of a code ("50100-10181a)") hide the row from the reader: cut them off (a Thai
        # name stuck to a code is split later by the reader itself)
        for line, w in mine:
            m = code_re.match(w.text)
            rest = w.text[m.end():]
            if rest and not re.search("[ก-๛]{2}", rest):
                w.text = w.text[:m.end()]
        # the page OCR's code against the code column's reading at the same height: both have blind spots (the
        # page reads 4 as 6, the column 0 as 9), so neither wins on its own. The rest of the document decides - the
        # plans of a college share their courses: the reading that ALSO appears elsewhere in the document is taken
        # (the column's: amber, with the reason); both or neither -> the code is not sure (red)
        for line, w in mine:
            here = [t for y, t in codes if abs((w.box[1] + w.box[3]) / 2 * k - y) < row_h]   # a wrapped name shifts it
            if len(here) != 1:
                continue
            col = here[0] if "-" in here[0] else here[0][:5] + "-" + here[0][5:]
            page_code = code_re.match(w.text).group(1)
            if col == page_code or not re.fullmatch(core, col):
                continue
            n_col, n_page = elsewhere[col], elsewhere[page_code] - 1
            if n_col >= 1 and n_page == 0:
                w.text = w.text.replace(page_code, col)
                w.doubt = "~page read %s, the code column reads %s, which appears %d more times in the document" % (
                    page_code, col, n_col)
            elif n_page >= 1 and n_col == 0:
                continue                               # the column misread; the page's code is confirmed elsewhere
            else:
                w.doubt = "the page reads %s, the code column reads %s" % (page_code, col)
        # rows the page OCR lost: a code in the code column with no code word at its height
        for y, t in codes:
            if any(abs((w.box[1] + w.box[3]) / 2 * k - y) < row_h for _, w in mine):
                continue
            norm = t if "-" in t else t[:5] + "-" + t[5:]
            if any(code_re.match(w.text).group(1) == norm and abs((w.box[1] + w.box[3]) / 2 * k - y) < row_h * 2
                   for _, w in mine):
                continue                              # the same code a little higher or lower: the same row
            t = t if "-" in t else t[:5] + "-" + t[5:]
            back = lambda x: (x + sk * y) / k                  # straightened pixels -> page points
            box = (back(a) + 2, (y - row_h / 2) / k, back(b) - 2, (y + row_h / 2) / k)
            line = min((l for l in page.lines if l.words), key=lambda l: abs(l.y - y / k))
            new = Word(t, t, box, 100.0, "cell")
            line.words = sorted(line.words + [new], key=lambda v: v.box[0])
            mine.append((line, new))
            stats["found"] += 1
        anchors = [(line, w, False) for line, w in mine] + \
                  [(line, w, True) for line, w in totals if inside(w, tb["name"]) or inside(w, tb["code"])]
        # the hours rows of the table: one per number in the LAST column (credits / total: always printed), with the
        # digit of every other column at that height; then each is paired with the NEAREST row anchor, one to one
        # (a two-line name puts the code on its second line and the hours on its first)
        triples = []
        for y, _ in reads[-1]:
            got = []
            for r in reads:
                hit = [d for yy, d in r if abs(yy - y) < row_h * 0.6]
                got.append(hit[0] if len(hit) == 1 else None)
            if None not in got:
                triples.append((y, got))
        pairs = sorted(((abs((w.box[1] + w.box[3]) / 2 * k - y), i, j) for i, (line, w, _) in enumerate(anchors)
                        for j, (y, _) in enumerate(triples)))
        given, used = {}, set()
        for dist, i, j in pairs:
            if dist <= row_h * 2 and i not in given and j not in used:
                given[i] = j
                used.add(j)
        for i, (line, w, is_total) in enumerate(anchors):
            if i not in given:
                continue                              # this row keeps its OCR words (the reader checks them)
            yc, got = triples[given[i]]
            if is_total:
                # a total has no rule to check it: the page OCR's words stay, the cell reading is ADDED next to them
                # (source "cell"); the reader accepts the total when either independent reading agrees with the rows
                back = lambda x: (x + sk * yc) / k
                line.words = sorted(line.words + [
                    Word(d, d, (back(tb["hours"][c][0]), w.box[1], back(tb["hours"][c][1]), w.box[3]), 100.0, "cell")
                    for c, d in enumerate(got)], key=lambda v: v.box[0])
                stats["totals"] += 1
                continue
            how = ""
            if not is_total:
                kind = "activity" if re.fullmatch(fmt.get("activity_code", "(?!)"), code_re.match(w.text).group(1)) \
                    else "course"
                after = [v for v in line.words if w.box[2] < v.box[0] and cx(v) < tb["hours"][-1][1]]
                old = reader.columns_in(after, kind)
                old_ok = old and (old[0][2].get("check") is None or old[0][2]["check"][0] == "amber")
                if not reader.credit_rule(dict(zip(cols, (int(d) for d in got))), kind):
                    if old_ok:
                        continue                      # the page OCR has one reading that fits: keep it
                # how sure the cell reading is, for the reader: the page OCR agrees (sure), reads other values that
                # fit too (amber now), or has nothing usable (one reading only: red if the term total fails)
                cell_vals = tuple(int(d) for d in got)
                old_vals = tuple(old[0][2][c] for c in cols) if old_ok else None
                if old_vals is None:
                    how = "~?only the cell reading"
                elif old_vals != cell_vals:
                    how = "~the cell reads %s, the page %s" % ("-".join(map(str, cell_vals)), "-".join(map(str, old_vals)))
            # clear the row's hours cells BY POSITION, on whatever OCR line their old words landed
            lo, hi = tb["hours"][0][0], tb["hours"][-1][1]
            top, bottom = (yc - row_h * 0.6) / k, (yc + row_h * 0.6) / k
            for l in page.lines:
                l.words = [v for v in l.words if not (lo <= cx(v) <= hi and top <= (v.box[1] + v.box[3]) / 2 <= bottom)]
            back = lambda x: (x + sk * yc) / k
            new = [Word(d, d, (back(tb["hours"][c][0]), w.box[1], back(tb["hours"][c][1]), w.box[3]), 100.0, "cell",
                        how) for c, d in enumerate(got)]
            line.words = sorted(line.words + new, key=lambda v: v.box[0])
            stats["totals" if is_total else "rows"] += 1
    page.lines = [l for l in page.lines if l.words]           # cells cleared by position can empty a line
    return stats
