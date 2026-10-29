"""Layer 2 - READ: Document + format facts -> study plan rows, course list, and checks (red / amber values).

Never a guess: a value the reader is not sure of becomes a CHECK with its reason and its place on the page,
and the head decides in step 2 (Review data). The course list is the second source for every plan row.
Regexes marked (cmp) in the format run on the comparable form of a line (no spaces, no Thai marks, ำ = า).
"""
import re
import subprocess
import tempfile
from pathlib import Path

from timetable_core import normalise as nz

IMPOSSIBLE_THAI = re.compile("ู(?=[าำ])")   # ู before า / ำ never happens: the font moved ้ (ไฟฟูา = ไฟฟ้า)


def cmp(s):
    return nz.comparable(s)


class Reader:
    def __init__(self, fmt, pdf=None):
        self.f = {k: v for k, v in fmt.items() if not k.startswith("_")}
        self.pdf = Path(pdf) if pdf else None
        if self.pdf:
            with self.pdf.open("rb") as f:
                if f.read(5) != b"%PDF-":
                    self.pdf = None                       # only a PDF can hide a value under another (has_ink)
        self._ink = {}
        self.checks = []

    # ------------------------------------------------------------ small facts
    def code_of(self, w):
        t = w.text.strip(self.f.get("border_marks", "")).rstrip(self.f.get("code_marks", ""))
        if not re.search("[A-WYZa-wyz]", t):
            t = t.replace("X", "x")
        if re.fullmatch(self.f["code"], t):
            return t, "activity" if re.fullmatch(self.f.get("activity_code", "(?!)"), t) else "course"
        if re.fullmatch(self.f["placeholder"], t):
            return t, "slot"
        return None, None

    def credits_in(self, words):
        """Every credit value in a run of words: [(first word, last word, value dict)].
        Single-word values first; words are joined (up to 3) ONLY when no single word is a credit - otherwise a name
        ending in a number joins its credit ("...คอมพิวเตอร์ 1" + "3(3-0-6)" became 13(3-0-6))."""
        for n in (1, 2, 3):
            found, i = [], 0
            while i + n <= len(words):
                part = words[i:i + n]
                joined = "".join(w.text for w in part)
                val = None
                m = re.fullmatch(self.f["credit"], joined)
                if m:                                         # the format names the parts: credits, lecture, lab...
                    val = {"lecture": None, "lab": None, "self_study": None, **self.parts(m), "field_hours": 0,
                           "text": joined}
                else:
                    fm = re.match(self.f.get("field_credit", "(?!)"), cmp(joined))
                    if fm and (n > 1 or ")" in joined):
                        val = {"lecture": 0, "lab": 0, "self_study": 0, **self.parts(fm), "text": joined}
                if val:
                    found.append((i, i + n - 1, val))
                    i += n
                else:
                    i += 1
            if found:
                return found
        return []

    def columns_in(self, words, kind="course"):
        """Hours printed in separate columns at the end of the row (vocational: ท ป น). The tail of the row is every
        word after the name that is short and holds a digit or a table border. Table borders read by OCR become
        extra digits ("3|0|3" read as "310] 3"): then every way to pick the values in order is tried, and the
        format's credit rule (credits = theory + practice / 2 or / 3) must leave exactly ONE - else it is red.
        Returns [(first word, last word, value dict)] like credits_in; value["check"] = (level, reason) or None."""
        cols = self.f["credit_columns"]
        i = len(words)
        while i > 0 and len(words[i - 1].text) <= 12 and re.search(r"[0-9oOlI|\[\]()]", words[i - 1].text) \
                and not re.search("[ก-๛]{2}", words[i - 1].text):
            i -= 1
        notes = [j for j in range(i, len(words)) if "*" in words[j].text]
        if notes:                                       # a note mark "(*4)" after the name ends the name
            i = notes[-1] + 1
        tail = words[i:]
        if not tail:
            return []
        text = " ".join(w.text for w in tail)
        text = text.translate(str.maketrans("oOlI", "0011"))     # in the hours columns only: OCR letters for digits
        numbers = [int(n) for n in re.findall("[0-9]+", text)]
        if not numbers:
            return []

        def value(vs, check):
            return {**dict(zip(cols, vs)), "self_study": None, "field_hours": 0, "text": text, "check": check}
        if len(numbers) == len(cols) and self.credit_rule(dict(zip(cols, numbers)), kind):
            return [(i, len(words) - 1, value(numbers, None))]
        digits = [int(d) for d in re.findall("[0-9]", text)]
        from itertools import combinations
        ok = {tuple(digits[j] for j in pick) for pick in combinations(range(len(digits)), len(cols))
              if self.credit_rule(dict(zip(cols, (digits[j] for j in pick))), kind)}
        if len(ok) == 1:
            vs = list(ok.pop())
            why = None if len(numbers) == len(cols) and vs == numbers else \
                ("amber", "read through table lines: %s -> %s" % (text, "-".join(map(str, vs))))
            return [(i, len(words) - 1, value(vs, why))]
        if numbers and len(numbers) == len(cols):
            return [(i, len(words) - 1, value(numbers, ("red", "%s does not follow the credit rule" % text)))]
        return [(i, len(words) - 1, {**{c: None for c in cols}, "self_study": None, "field_hours": 0, "text": text,
                                     "check": ("red", "hours not readable: %s (%s)" % (
                                         text, "several readings fit" if ok else "no reading fits the credit rule"))})]

    def credit_rule(self, v, kind="course"):
        """The format's rule linking the columns: credits = theory + practice / k for one k of practice_per_credit
        (vocational: 2 in a classroom, 3 in a workshop); an ACTIVITY has 0 credits and no theory, a course has
        credits."""
        t, p, n = v.get("lecture"), v.get("lab"), v.get("credits")
        if None in (t, p, n) or t > 12 or p > 40 or n > 12:
            return False
        if kind == "activity" or n == 0:
            return kind == "activity" and t == 0 and n == 0 and p > 0
        return any(p % k == 0 and n == t + p // k for k in self.f.get("practice_per_credit", ()))

    @staticmethod
    def parts(m):
        """A credit match -> the parts the format names, as numbers; a part printed as x = None (not set)."""
        num = lambda v: None if v is None or not v.isdigit() else int(v)
        return {k: num(v) for k, v in m.groupdict().items()}

    def has_ink(self, page, box):
        """Is anything printed at this spot? (CED hides a second, sometimes different, credit under the visible one.)"""
        if not self.pdf:
            return None
        if page not in self._ink:
            from PIL import Image
            with tempfile.TemporaryDirectory() as tmp:
                subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "72", "-gray", "-png",
                                "-singlefile", str(self.pdf), tmp + "/p"], capture_output=True)
                self._ink[page] = Image.open(tmp + "/p.png").convert("L")
                self._ink[page].load()
        img = self._ink[page]
        x0, y0, x1, y1 = (int(v) for v in box)
        area = img.crop((x0 + 1, y0 + 1, max(x0 + 2, x1 - 1), max(y0 + 2, y1 - 1))).point(lambda v: 255 if v < 128 else 0)
        return area.getbbox() is not None

    def check(self, level, reason, page, box=None, **where):
        self.checks.append({"level": level, "reason": reason, "page": page, "box": box, **where})

    # ------------------------------------------------------------ one table row
    def row(self, line, index):
        ws = line.words
        marks = self.f.get("border_marks", "")
        while marks and ws and not ws[0].text.strip(marks + " "):      # a stray table line before the code
            ws = ws[1:]
        if not ws:
            return None
        if marks and not self.code_of(ws[0])[0]:
            # OCR crumbs from the table border can sit LEFT of the code ("|8|3|รเวอบ2014|" before 31901-2014) or on
            # it ("viii"): a word whose middle lies before the code starts, or with no two Thai letters in a row, is
            # not part of the row (the name comes after the code)
            for j in (1, 2):
                if j < len(ws) and self.code_of(ws[j])[0] and all(
                        (w.box[0] + w.box[2]) / 2 < ws[j].box[0] or not re.search("[ก-๛]{2}", w.text) for w in ws[:j]):
                    ws = ws[j:]
                    break
        code, kind = self.code_of(ws[0])
        if not code:
            return None
        found = self.columns_in(ws[1:], kind) if self.f.get("credit_columns") else self.credits_in(ws[1:])
        found = [(a + 1, b + 1, v) for a, b, v in found]
        r = {"code": code, "kind": kind, "page": line.page, "code_box": ws[0].box,
             "mark": ws[0].text[len(code):] if len(ws[0].text) > len(code) else ""}
        if found:
            if len(found) > 1:
                visible = [f for f in found if self.has_ink(line.page, union(ws[f[0]:f[1] + 1])) is not False]
                if len(visible) == 1:
                    found = visible
                else:
                    self.check("red", "two credit values printed: %s" % " / ".join(f[2]["text"] for f in found),
                               line.page, union(ws[found[0][0]:found[-1][1] + 1]), code=code, field="credits")
            a, b, val = found[0]
            r.update({k: v for k, v in val.items() if k not in ("text", "check")}, credit_box=union(ws[a:b + 1]))
            if val.get("check"):
                self.check(val["check"][0], val["check"][1], line.page, r["credit_box"], code=code, field="credits")
            name_words = ws[1:a]
        elif len(ws) > 2 and re.fullmatch(self.f.get("credit_plain", "(?!)"), ws[-1].text):
            # only the credit is printed (a thesis "12", some transfer rows "3"): hours come from the course list
            r.update(credits=int(ws[-1].text), lecture=None, lab=None, self_study=None, field_hours=0,
                     credit_box=ws[-1].box, hours_from_list=True)
            name_words = ws[1:-1]
        else:
            r.update(credits=None, lecture=None, lab=None, self_study=None, field_hours=0, credit_box=None)
            name_words = ws[1:]
            self.check("red", "no credit value on this row", line.page, line.words[0].box, code=code, field="credits")
        name = " ".join(w.text for w in name_words).strip()
        r["name_th"] = self.repair(name, line.page, code)
        # scanned pages: the glyph pass may doubt a code or a credit - then it is red, with the glyph pass's reason
        if ws[0].doubt:                             # "~..." = settled by a second reading, worth a look (amber)
            level, why = ("amber", ws[0].doubt[1:]) if ws[0].doubt.startswith("~") else ("red", ws[0].doubt)
            self.check(level, "code not sure: " + why if level == "red" else "code: " + why, line.page, ws[0].box,
                       code=code, field="code")
        if found:
            doubts = [w.doubt for w in ws[found[0][0]:found[0][1] + 1] if w.doubt]
            if doubts and doubts[0].startswith("~?"):     # one reading only: fine unless the term total fails
                r["single_reading"] = True
            elif doubts and doubts[0].startswith("~"):    # two readings that both fit the rule: a look (amber)
                self.check("amber", "hours: " + doubts[0][1:], line.page, r["credit_box"], code=code, field="credits")
            elif doubts:
                self.check("red", "credits not sure: " + doubts[0], line.page, r["credit_box"], code=code, field="credits")
        r["source"] = "glyph" if any(w.source == "glyph" for w in ws) else ("ocr" if ws[0].source == "ocr" else "text")
        r["name_en"] = ""
        return r

    def repair(self, name, page, code):
        fixed = IMPOSSIBLE_THAI.sub("้", name)
        if fixed != name:
            self.check("amber", "name repaired: %s -> %s" % (name, fixed), page, code=code, field="name_th")
        return fixed

    # ------------------------------------------------------------ sections
    def sections(self, doc):
        """(plan sections, course-list lines). A plan section starts at a plan heading followed by a year/term line."""
        lines = [l for p in doc.pages for l in p.lines]
        plans, course_list, i, list_start = [], [], 0, None
        while i < len(lines):
            c = cmp(lines[i].text)
            two_tables = len(re.findall(self.f["plan_word"], c)) > 1
            if re.match(self.f["plan_heading"], c) and len(c) < self.f["heading_max"] and not two_tables \
                    and self.year_term_ahead(lines, i):
                j = i + 1
                while j < len(lines):
                    cj = cmp(lines[j].text)
                    if re.match(self.f["course_list_heading"], cj) or re.match(self.f["section_end"], cj) \
                            or (re.match(self.f["plan_heading"], cj) and len(cj) < self.f["heading_max"]
                                and self.year_term_ahead(lines, j)):
                        break
                    j += 1
                plans.append((i, lines[i], lines[i + 1:j]))
                i = j
                continue
            if re.match(self.f["course_list_heading"], c) and len(c) < self.f["list_heading_max"]:
                list_start = i if list_start is None else list_start
                j = i + 1
                while j < len(lines) and not re.match(self.f["section_end"], cmp(lines[j].text)):
                    j += 1
                course_list += lines[i + 1:j]
                i = j
                continue
            i += 1
        # the study plan (3.1.4) comes BEFORE the course list (3.1.5); a plan-like table after it is an appendix
        plans = [(h, ls) for k, h, ls in plans if list_start is None or k < list_start]
        return plans, course_list

    def year_term_ahead(self, lines, i):
        page = lines[i].page
        for l in lines[i + 1:i + self.f["term_lookahead_lines"]]:
            if l.page > page + self.f["term_lookahead_pages"]:
                return False
            if re.search(self.f["term"], cmp(l.text)):
                return True
        return False

    # ------------------------------------------------------------ the whole document
    def split_columns(self, doc):
        """Two tables side by side (vocational: term 1 | term 2 on one page): from the line that holds two term
        headings down, every line is cut at the second heading - the left halves are read first, then the right."""
        from .convert import to_lines
        for page in doc.pages:
            # every term heading on the page: (line index, its first word); two side by side = the cut. On a tilted
            # scan the two headings can land on neighbouring OCR lines a few points apart
            heads = []
            for k, line in enumerate(page.lines):
                for j in range(len(line.words)):
                    if re.match(self.f["term"], cmp(" ".join(w.text for w in line.words[j:]))):
                        heads.append((k, line.words[j]))
            pair = None
            for i, (k1, w1) in enumerate(heads):
                for k2, w2 in heads[i + 1:]:
                    if abs((w1.box[1] + w1.box[3]) / 2 - (w2.box[1] + w2.box[3]) / 2) < 8 \
                            and abs(w1.box[0] - w2.box[0]) > 100:
                        pair = (min(k1, k2), min((w1, w2), key=lambda w: w.box[0]), max((w1, w2), key=lambda w: w.box[0]))
                        break
                if pair:
                    break
            if pair:
                k, first, second = pair
                # the cut: where the second table starts = its first column header (a centred term heading starts
                # further right than the table under it); no header found -> midway between the two headings
                cut = (first.box[2] + second.box[0]) / 2
                for l in page.lines[k + 1:k + 5]:
                    hs = [w for w in l.words if re.match(self.f.get("column_header", "(?!)"), cmp(w.text))]
                    if len(hs) >= 2:
                        cut = hs[1].box[0] - 1
                        break
                # the lines are made again inside each column: rows of two tables side by side sit at slightly
                # different heights, and lines made across the whole page cut a row from its own hours
                below = [w for l in page.lines[k:] for w in l.words]
                left = to_lines(page.number, [w for w in below if (w.box[0] + w.box[2]) / 2 < cut])
                right = to_lines(page.number, [w for w in below if (w.box[0] + w.box[2]) / 2 >= cut])
                page.lines = page.lines[:k] + left + right
        return doc

    def unglue(self, doc):
        """OCR of a ruled table glues a code to its name across the table line ("30000-1305|วิทยาศาสตร์..."): split
        such a word into the code and the name (the box is shared out by the number of characters)."""
        from timetable_core.document import Word
        marks = re.escape(self.f.get("border_marks", ""))
        glued = re.compile("^[%s]*(%s)[%s]*([^0-9%s-].*)$" % (marks, self.f["code"].strip("^$"), marks, marks))
        for page in doc.pages:
            for line in page.lines:
                out = []
                for w in line.words:
                    m = glued.match(w.text)
                    if not m:
                        out.append(w)
                        continue
                    x0, y0, x1, y1 = w.box
                    mid = x0 + (x1 - x0) * len(m.group(1)) / len(w.text)
                    out += [Word(m.group(1), m.group(1), (x0, y0, mid, y1), w.conf, w.source, w.doubt),
                            Word(m.group(2), m.group(2), (mid, y0, x1, y1), w.conf, w.source)]
                line.words = out
        return doc

    def read(self, doc):
        if self.f.get("border_marks") or self.f.get("side_by_side_terms"):
            import copy
            doc = copy.deepcopy(doc)                   # reading never changes the caller's document
        if self.f.get("border_marks"):
            self.unglue(doc)
        if self.f.get("side_by_side_terms"):
            self.split_columns(doc)
        plans, course_list = self.sections(doc)
        subjects = self.course_list(course_list)
        rows, terms = [], []
        seen, keyed, first_acyear = {}, {}, {}
        for heading, lines in plans:
            year = term = None
            key = re.search(self.f.get("plan_key", "(?!)"), cmp(heading.text))
            heading = clean_heading(heading)
            if key:
                # the format names what identifies a plan (vocational: the student-group code): the same key on a
                # later page CONTINUES that plan (year 2 on the next page), whatever OCR made of the rest
                label = keyed.setdefault(key.group(1), heading.text)
            else:
                # every plan section is its own plan, even when the headings read the same (Chula prints one
                # "แผนการศึกษา" per major): the 2nd one becomes "แผนการศึกษา (2, page 46)"
                seen[heading.text] = seen.get(heading.text, 0) + 1
                label = heading.text if seen[heading.text] == 1 else "%s (%d, page %d)" % (
                    heading.text, seen[heading.text], heading.page)
            cur = []
            for k, line in enumerate(lines):
                c = cmp(line.text)
                vm = re.match(self.f.get("variant", "(?!)"), c)
                if vm:                                        # แผน ก / แผน ข: a second plan inside the same section
                    label = "%s - %s" % (heading.text, line.text)
                    year = term = None
                    continue
                ym, tm = re.search(self.f["year"], c), re.search(self.f["term"], c)
                acyear = tm.groupdict().get("acyear") if tm else None
                if ym or tm:
                    new_term = None
                    if tm:
                        g = tm.group(1)
                        looks = self.f.get("term_lookalikes", {})
                        if g in looks:                    # "ภาคเรียนที่ S" (summer); OCR reads the S as 5
                            new_term = looks[g]
                            if g.isdigit():
                                self.check("amber", "term heading reads %s: taken as S = summer (term %d)" % (g, new_term),
                                           line.page, union(line.words), field="term")
                        else:
                            new_term = int(g) if g else self.f["term_words"][tm.group(2)]
                    if ym:
                        year = int(ym.group(1))
                    elif acyear:                              # "ภาคเรียนที่ 1 ปีการศึกษา 2570": year 2 of a plan from 2569
                        year = int(acyear) - first_acyear.setdefault(label, int(acyear)) + 1
                    elif new_term is not None:
                        # the year heading is unreadable (a scan: OCR read ปีที่ 1 as "Un 1") - terms come in order:
                        # start at year 1, and a term number that goes back down means the next year
                        inferred = 1 if year is None else (year + 1 if term is not None and new_term <= term else year)
                        if inferred != year or year is None:
                            self.check("amber", "year %d worked out from the order of terms (heading unreadable)" % inferred,
                                       line.page, union(line.words), field="year")
                        year = inferred
                    if new_term is not None and new_term not in self.f.get("term_numbers", (1, 2, 3)):
                        # OCR made an impossible term ("ภาคเรียนที่ 5"): the next one after the last, as printed in order
                        guess = 1 if term is None or term >= max(self.f.get("term_numbers", (1, 2, 3))) else term + 1
                        self.check("amber", "term %d worked out from the order of terms (heading read as %d)"
                                   % (guess, new_term), line.page, union(line.words), field="term")
                        new_term = guess
                    if new_term is not None:
                        term = new_term
                    cur = []
                    terms.append((label, year, term))
                    continue
                if re.match(self.f["total"], c):
                    self.total(line, cur, year, term)
                    continue
                if line.words and line.words[0].text.startswith("(") and cur and not cur[-1]["name_en"] \
                        and not self.code_of(line.words[0])[0]:          # "(|30000-2002|" is a row, not a name
                    cur[-1]["name_en"] = " ".join(w.raw for w in line.words).strip("() ")
                    continue
                r = self.row(line, k) if year and term and line.words else None
                if r:
                    r.update(plan=label, year=year, term=term, order=len(cur) + 1)
                    cur.append(r)
                    rows.append(r)
        self.cross_check(rows, subjects)
        return {"plans": sorted({r["plan"] for r in rows}), "terms": terms, "rows": rows,
                "subjects": subjects, "checks": self.checks}

    def list_only(self, doc):
        """A file with subjects but NO term plan (a course list: code, name, ท-ป-น): every subject line anywhere in
        the document, with the heading it sits under (กลุ่ม / หมวด ...) and whether that heading is an ELECTIVE group
        (เลือก) or a CONDITIONAL one (ปรับพื้นฐาน: only some students take it) - the words are the format's list_*
        regexes. The planner then picks which subjects go into a term. Same result shape as read(), rows = []."""
        self.checks = []
        subjects, group = {}, ""
        dashed = re.compile(self.f.get("credit_dashed", "(?!)"))
        for line in (l for p in doc.pages for l in p.lines):
            if not line.words:
                continue
            code, kind = self.code_of(line.words[0])
            if not code or kind == "slot":
                c = cmp(line.text)
                if re.search(self.f.get("list_group", "กลม|หมวด"), c) and len(c) < self.f.get("list_heading_max", 40) * 3:
                    group = line.text.strip()
                continue
            ws = line.words[1:]
            found = self.credits_in(ws)
            if not found:
                m = next(((i, dashed.fullmatch(w.text)) for i, w in enumerate(ws) if dashed.fullmatch(w.text)), None)
                if m:
                    found = [(m[0], m[0], {**self.parts(m[1]), "self_study": None, "field_hours": 0, "text": m[1].group(0)})]
            if not found and self.f.get("credit_columns"):
                found = self.columns_in(ws, kind)
            if not found or code in subjects:
                continue
            a, _, val = found[0]
            name = " ".join(w.text for w in ws[:a]).strip()
            check = val.pop("check", None)
            if check is None and "credits" in val and not self.credit_rule(val, kind) and self.f.get("practice_per_credit"):
                check = ("red", "%s does not follow the credit rule" % val.get("text"))
            subjects[code] = {**{k: v for k, v in val.items() if k != "text"}, "kind": kind,
                              "name_th": IMPOSSIBLE_THAI.sub("้", name), "name_en": "", "page": line.page, "needs": [],
                              "group": group, "choice": self.choice(group, kind)}
            if check:
                self.check(check[0], check[1], line.page, union(line.words), code=code)
        return {"plans": [], "terms": [], "rows": [], "subjects": subjects, "checks": self.checks, "list_only": True}

    def choice(self, group, kind):
        """required / elective / conditional, from the heading a listed subject sits under (an activity: required)."""
        g = cmp(group)
        if kind != "activity" and re.search(self.f.get("list_conditional", "(?!)"), g):
            return "conditional"
        if kind != "activity" and re.search(self.f.get("list_elective", "เลอก"), g):
            return "elective"
        return "required"

    def total(self, line, cur, year, term):
        if not cur:
            return
        if self.f.get("credit_columns"):                 # a total is plain numbers (it follows no credit rule)
            # two independent readings: the page OCR and the cell pass (source "cell"); a column's total is
            # confirmed when EITHER agrees with the rows, red only when neither does
            readings = []
            for cell in (False, True):
                nums = [int(n) for n in re.findall("[0-9]+", " ".join(
                    w.text for w in line.words if (w.source == "cell") == cell and not re.search("[ก-๛]{2}", w.text)))]
                if len(nums) == len(self.f["credit_columns"]):
                    readings.append(dict(zip(self.f["credit_columns"], nums)))
            if not readings:
                return
            for k in self.f["credit_columns"]:
                if any(r[k] is None for r in cur):
                    continue
                got = sum((r[k] or 0) for r in cur)
                for r in cur:
                    r["total_ok"] = r.get("total_ok", True) and any(got == p[k] for p in readings)
                if all(got != p[k] for p in readings):
                    self.check("red", "year %s term %s: rows add up to %d %s, the total line says %s"
                               % (year, term, got, k, " or ".join(sorted({str(p[k]) for p in readings}))),
                               line.page, union(line.words), field=k)
                    # a total that fails points at the rows read the least surely: hours settled through table
                    # lines (amber) become red - one of them may pass the credit rule and still be wrong; hours read
                    # once only (the cell pass alone) become amber: the head looks there first
                    mine = {(r["page"], r["code"]) for r in cur}
                    for c in list(self.checks):
                        if c["level"] == "amber" and c.get("field") == "credits" and (c["page"], c.get("code")) in mine \
                                and not c["reason"].startswith("hours read once only"):
                            c["level"] = "red"
                            c["reason"] += " - and this term's total does not add up"
                    for r in cur:
                        if r.get("single_reading") and not r.get("_flagged"):
                            r["_flagged"] = True
                            self.check("amber", "hours read once only (%s-%s-%s) and this term's total does not add up"
                                       % (r["lecture"], r["lab"], r["credits"]), r["page"], r.get("credit_box"),
                                       code=r["code"], field="credits")
            return
        else:
            found = self.credits_in(line.words[1:])
            if not found:
                return
            printed = found[0][2]
        for k in ("credits", "lecture", "lab", "self_study"):
            if printed.get(k) is None:
                continue
            got = sum((r[k] or 0) for r in cur)
            if any(r[k] is None for r in cur):
                continue                                      # an x-x-x row: hours cannot be summed
            for r in cur:
                r["total_ok"] = r.get("total_ok", True) and got == printed[k]
            if got != printed[k]:
                self.check("red", "year %s term %s: rows add up to %d %s, the total line says %d"
                           % (year, term, got, k, printed[k]), line.page, union(line.words), field=k)

    def course_list(self, lines):
        """The course descriptions (3.1.5): every subject with its credits, names and prerequisites ("needs": the
        codes after the format's prerequisite label, on its line and on lines that continue it - a line ending in
        และ / หรือ, or a code line without credits right after it). No label = needs [] (unknown, not an error)."""
        subjects = {}
        last = owner = None
        label = re.compile(self.f.get("prerequisite", "(?!)"))
        joins = {"และ", "หรอ", "and", "or", ","}
        cont, seen_at = False, {}
        for line in lines:
            if not line.words:
                continue
            code, kind = self.code_of(line.words[0])
            found = self.credits_in(line.words[1:]) if code and kind == "course" else []
            if found:
                a, b, val = found[0]
                name = " ".join(w.text for w in line.words[1:a + 1])
                cont = False
                if code not in subjects:
                    subjects[code] = {**{k: v for k, v in val.items() if k != "text"},
                                      "name_th": IMPOSSIBLE_THAI.sub("้", name).strip(), "name_en": "",
                                      "page": line.page, "needs": []}
                    last = owner = code
                else:
                    last = owner = None                     # a repeat of the subject (an appendix): read once
                continue
            at = next((i for i in range(len(line.words))
                       if label.search(cmp(" ".join(w.text for w in line.words[:i + 1])))), None)
            if owner and (at is not None or (cont and code)):
                words = line.words[at + 1:] if at is not None else line.words
                for w in words:
                    c, k = self.code_of(w)
                    if c and c not in subjects[owner]["needs"] and c != owner:
                        subjects[owner]["needs"].append(c)
                        seen_at.setdefault(c, (line.page, union([w]), owner))
                cont = cmp(line.words[-1].text).lower() in joins
                continue
            cont = False
            if last and line.words[0].text.startswith("(") and not subjects[last]["name_en"]:
                subjects[last]["name_en"] = " ".join(w.raw for w in line.words).strip("() ")
            last = None if not line.words[0].text.startswith("(") else last
        for c, (page, box, owner) in seen_at.items():
            if c not in subjects:                           # kept: it may be a subject of another curriculum
                self.check("amber", "prerequisite %s (of %s) is not in this curriculum's course list" % (c, owner),
                           page, box, code=owner, field="needs")
        return subjects

    def cross_check(self, rows, subjects):
        """The course list repeats every code with its credits: the plan row must agree, or it is checked."""
        for r in rows:
            if r["kind"] != "course":
                continue
            s = subjects.get(r["code"])
            if not s:
                if subjects:                              # a document without a course list cannot be checked
                    self.check("amber", "not found in the course list", r["page"], r["code_box"], code=r["code"], field="code")
                if r.get("hours_from_list"):
                    self.check("amber", "only the credit is printed and there is no course list for the hours",
                               r["page"], r["credit_box"], code=r["code"], field="lecture")
                continue
            if r.get("hours_from_list"):
                for k in ("lecture", "lab", "self_study", "field_hours"):
                    r[k] = s.get(k)
                if s["credits"] != r["credits"]:
                    self.check("red", "plan says %s credits, the course list says %s" % (r["credits"], s["credits"]),
                               r["page"], r["credit_box"], code=r["code"], field="credits")
                continue
            for k in ("credits", "lecture", "lab", "self_study", "field_hours"):
                if r.get(k) is not None and s.get(k) is not None and r[k] != s[k]:
                    self.check("red", "plan says %s = %s, the course list says %s" % (k, r[k], s[k]),
                               r["page"], r["credit_box"], code=r["code"], field=k)
            if not r["name_en"] and s["name_en"]:
                r["name_en"] = s["name_en"]


def clean_heading(line):
    """A plan heading without the OCR crumbs after it ("... เทคนิคการผลิต a a a ew 1 a"): trailing words with no
    two Thai letters in a row and no digit are dropped."""
    from timetable_core.document import Line
    words = list(line.words)
    while len(words) > 1 and not re.search("[ก-๛]{2}|[0-9]", words[-1].text):
        words.pop()
    return Line(line.page, words)


def union(words):
    return (min(w.box[0] for w in words), min(w.box[1] for w in words),
            max(w.box[2] for w in words), max(w.box[3] for w in words))
