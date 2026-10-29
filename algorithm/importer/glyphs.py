"""GLYPH READER (prototype): read codes and credits with the DOCUMENT'S OWN FONT and a tiny alphabet.

Why: general OCR picks from thousands of characters, so x becomes ๐ and ๔ becomes ๕. A code only uses ~15
symbols, and one document uses one font. So: cut examples of each symbol out of the document itself
(labelled by its text layer, or on a scan by trusted copies), then read an uncertain word by comparing
each of its characters with those examples only. Pure Python + PIL, no model, no extra install.
"""
from collections import defaultdict
from PIL import Image

SIZE = 20                      # each character is compared as a 20 x 20 black-and-white picture
MAX_EXAMPLES = 25              # per symbol
CONFLICT = 0.04                # closer than this to another symbol's example = a wrong label


def binary(img):
    """Otsu threshold -> set of ink pixels (x, y)."""
    g = img.convert("L")
    hist = g.histogram()
    total, sum_all = sum(hist), sum(i * h for i, h in enumerate(hist))
    best, cut, w0, s0 = 0, 128, 0, 0
    for i in range(256):
        w0 += hist[i]
        if not w0 or w0 == total:
            continue
        s0 += i * hist[i]
        m0, m1 = s0 / w0, (sum_all - s0) / (total - w0)
        b = w0 * (total - w0) * (m0 - m1) ** 2
        if b > best:
            best, cut = b, i
    px = g.load()
    ink = {(x, y) for y in range(g.height) for x in range(g.width) if px[x, y] <= cut}
    # table lines are not characters: drop rows / columns that are almost all ink (they would join every character)
    for y in range(g.height):
        if sum((x, y) in ink for x in range(g.width)) > 0.7 * g.width:
            ink -= {(x, y) for x in range(g.width)}
    for x in range(g.width):
        if sum((x, y) in ink for y in range(g.height)) > 0.85 * g.height:
            ink -= {(x, y) for y in range(g.height)}
    return ink, g.size


def components(ink):
    """Connected groups of ink pixels (8 neighbours), left to right. Tiny specks are dropped."""
    seen, out = set(), []
    for p in ink:
        if p in seen:
            continue
        stack, comp = [p], []
        seen.add(p)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in ink and q not in seen:
                        seen.add(q)
                        stack.append(q)
        if len(comp) >= 4:
            out.append(comp)
    # a piece lying above/below another (a dot, a broken stroke) belongs to the same character
    out.sort(key=lambda c: min(x for x, _ in c))
    merged = []
    for c in out:
        x0, x1 = min(x for x, _ in c), max(x for x, _ in c)
        if merged:
            m = merged[-1]
            mx0, mx1 = min(x for x, _ in m), max(x for x, _ in m)
            overlap = min(x1, mx1) - max(x0, mx0)
            if overlap > 0.6 * min(x1 - x0 + 1, mx1 - mx0 + 1):
                m.extend(c)
                continue
        merged.append(c)
    return merged


def split_wide(comps):
    """Letters that touch (CED's xxxxxxx) form one wide blob: cut it at its thinnest columns."""
    if not comps:
        return comps
    hs = sorted(max(y for _, y in c) - min(y for _, y in c) + 1 for c in comps)
    h = hs[-1]                       # the TALLEST character (a "-" is short; Thai digits are wide but not tall)
    out = []
    for c in comps:
        xs = [x for x, _ in c]
        x0, x1 = min(xs), max(xs)
        w = x1 - x0 + 1
        if w <= 1.6 * h:
            out.append(c)
            continue
        cols = defaultdict(int)
        for x, _ in c:
            cols[x] += 1
        n = max(2, round(w / (0.65 * h)))                  # about how many letters are in it
        cuts = []
        for k in range(1, n):
            centre = x0 + w * k / n
            lo, hi = int(centre - 0.25 * w / n), int(centre + 0.25 * w / n)
            cuts.append(min(range(lo, hi + 1), key=lambda x: (cols.get(x, 0), abs(x - centre))))
        edges = [x0 - 1] + cuts + [x1]
        for a, b in zip(edges, edges[1:]):
            part = [(x, y) for x, y in c if a < x <= b]
            if len(part) >= 4:
                out.append(part)
    return out


def shape(comp, word_h, word_y1=None):
    """A character as features: 20x20 picture (aspect kept) + its height and width relative to the word
    + how far its bottom sits above the word's bottom (a raised * is high; digits and x sit on the line)."""
    xs, ys = [x for x, _ in comp], [y for _, y in comp]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    side = max(w, h)
    img = Image.new("L", (side, side), 0)
    ox, oy = (side - w) // 2, (side - h) // 2
    for x, y in comp:
        img.putpixel((x - x0 + ox, y - y0 + oy), 255)
    small = img.resize((SIZE, SIZE), Image.BILINEAR)
    bits = 0
    for v in small.getdata():                      # the picture as ONE number: 400 bits, compared with XOR
        bits = (bits << 1) | (v > 80)
    gap = (word_y1 - max(ys)) / word_h if word_y1 is not None else 0.0
    return bits, h / word_h, w / word_h, gap


def split_word(crop):
    ink, (cw, ch) = binary(crop)
    # a piece touching the left/right edge of the crop is a scrap of a table line or a neighbour, not a letter
    comps = [c for c in components(ink) if min(x for x, _ in c) > 0 and max(x for x, _ in c) < cw - 1]
    comps = split_wide(comps)
    if not comps:
        return []
    y1 = max(max(y for _, y in c) for c in comps)
    word_h = y1 - min(min(y for _, y in c) for c in comps) + 1
    return strip_mark([shape(c, word_h, y1) for c in comps])


def strip_mark(pieces):
    """A footnote mark after a code (020413105* = taught in English) is small and RAISED: drop it."""
    if len(pieces) >= 5 and pieces[-1][1] < 0.6 and pieces[-1][3] > 0.3:
        return pieces[:-1]
    return pieces


class Font:
    """The document's own examples of each symbol."""

    def __init__(self):
        self.ex = defaultdict(list)
        self.conflicts = 0
        self.disputed = set()

    def learn(self, crop, text, only=None):
        """Add examples from a word whose true text is known. Skipped when the pieces do not match the letters.
        only = a set of symbols: learn just those (e.g. the brackets of a credit whose digits are not trusted)."""
        chars = [c for c in text if not c.isspace()]
        pieces = split_word(crop)
        if len(pieces) != len(chars):
            return False
        pairs = [(ch, p) for ch, p in zip(chars, pieces) if only is None or ch in only]
        # CONFLICT GUARD: a piece almost identical to an example of ANOTHER symbol means the label is wrong
        # (a misread pair, a code taken for a placeholder) - learn nothing from this word
        for ch, p in pairs:
            for other, exs in self.ex.items():
                if other != ch and exs and min(self.distance(p, e) for e in exs) < CONFLICT:
                    self.conflicts += 1
                    self.disputed |= {ch, other}         # this document taught these two symbols for one shape
                    return False
        for ch, p in pairs:
            if len(self.ex[ch]) < MAX_EXAMPLES:
                self.ex[ch].append(p)
        return True

    @staticmethod
    def distance(p, e):
        return (p[0] ^ e[0]).bit_count() / (SIZE * SIZE) + 0.5 * abs(p[1] - e[1]) + 0.5 * abs(p[2] - e[2])

    def classify(self, p):
        """(best symbol, distance, distance of the best OTHER symbol) - the gap says how sure it is."""
        bits, rh, rw = p[:3]
        best = {}
        for ch, exs in self.ex.items():
            d = min(self.distance(p, e) for e in exs)
            best[ch] = d
        ranked = sorted(best.items(), key=lambda kv: kv[1])
        if not ranked:
            return None, 1.0, 1.0
        second = ranked[1][1] if len(ranked) > 1 else 1.0
        return ranked[0][0], ranked[0][1], second

    def agreement(self, p, k=5):
        """Share of the k nearest learned examples that carry the SAME label as the nearest one. Real variants of
        one symbol never mix labels; a mixed neighbourhood means some examples were taught wrong (TU: 3s learned as 5)."""
        near = sorted((self.distance(p, e), ch) for ch, exs in self.ex.items() for e in exs)[:k]
        return sum(ch == near[0][1] for _, ch in near) / len(near) if near else 0.0

    def read(self, crop):
        """(text, margin, worst, agree): margin = smallest gap between best and second-best symbol (small = unsure),
        worst = largest distance to the chosen symbol (large = a shape the document never taught - it must NOT be
        forced into the nearest known one), agree = lowest neighbour agreement of any character."""
        out, margin, worst, agree = [], 1.0, 0.0, 1.0
        for p in split_word(crop):
            ch, d, d2 = self.classify(p)
            if ch is None:
                return "", 0.0, 1.0, 0.0
            out.append(ch)
            margin, worst, agree = min(margin, d2 - d), max(worst, d), min(agree, self.agreement(p))
        return "".join(out), margin, worst, agree

    def sprite(self, ch, scale=2):
        """The first learned example of a symbol as a small picture (for the comparison page)."""
        bits = self.ex[ch][0][0]
        img = Image.new("L", (SIZE, SIZE), 255)
        for i in range(SIZE * SIZE):
            if bits >> (SIZE * SIZE - 1 - i) & 1:
                img.putpixel((i % SIZE, i // SIZE), 0)
        return img.resize((SIZE * scale, SIZE * scale), Image.NEAREST)
