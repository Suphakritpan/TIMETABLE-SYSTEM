"""NORMALISE: the step between converter and reader (test_pdf/REVIEW.txt, N1-N4 + N7).

Each rule is text -> text and only fixes damage that has ONE right answer. Lost marks (ำ -> า), characters the
converter could not decode (U+FFFD) and old font encodings are NOT fixed here: they need OCR or the second copy
of a course (the reader's job). This file uses \\u codes for invisible Thai marks so it stays readable.
Run the self-tests:  python3 lib/normalise.py
"""
import re

THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
DASHES = str.maketrans({"–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-"})

# Thai font glyph codes (Private Use Area U+F700-F71A) -> real Thai characters. Shifted copies of one mark
# (moved left / down for tall letters) all become that one mark. Checked on masters_2565, phd_2565, Mahidol x2.
GLYPHS = str.maketrans({
    0xF700: "ฐ", 0xF701: "ิ", 0xF702: "ี", 0xF703: "ึ", 0xF704: "ื",
    0xF705: "่", 0xF706: "้", 0xF707: "๊", 0xF708: "๋", 0xF709: "์",
    0xF70A: "่", 0xF70B: "้", 0xF70C: "๊", 0xF70D: "๋", 0xF70E: "์",
    0xF70F: "ญ", 0xF710: "ั", 0xF711: "ํ", 0xF712: "็", 0xF713: "่",
    0xF714: "้", 0xF715: "๊", 0xF716: "๋", 0xF717: "์", 0xF718: "ุ",
    0xF719: "ู", 0xF71A: "ฺ",
})
GLYPH_RE = re.compile("[-]")

# a Thai word can never START with a combining mark or with ะ า ำ ๅ -> a space before one of them is damage
MARK_CHARS = "ัิ-ฺ็-๎"
NO_START = MARK_CHARS + "ะาำๅ"
SPACE_BEFORE_MARK = re.compile("(?<=[ก-๎]) +(?=[%s])" % NO_START)
NIKHAHIT_AA = re.compile("ํา")       # ํ + า -> ำ (looks identical on screen, does not match in search)
MARKS = re.compile("[%s�]" % MARK_CHARS)   # + U+FFFD: a character the converter could not decode
SARA_AM, SARA_AA = "ำ", "า"


# SUSPECT tokens: OCR guessed (e.g. a small "x" read as the Thai digit zero). They are NEVER converted, so a
# guess like 04<thai digits> cannot become a believable code such as 0420000005. They are counted and flagged.
MIXED_DIGITS = re.compile("[0-9]\\S*[\u0e50-\u0e59]|[\u0e50-\u0e59]\\S*[0-9]")   # S1 Arabic + Thai digits in one token
# a real placeholder piece is digits first, then x's of ONE case: 04xxxxxxx, 0204133xx, XXXX, x
# (curricula also write 3(x-x-x), วพ.4xx, (240XXXX), masked IDs 3-1201-0155x-xxx - all made of such pieces)
CLEAN_PIECE = re.compile("^[0-9\u0e50-\u0e59]*(?:x+|X+)$")
PIECES = re.compile("[.\\-()/,\\[\\]\u2013\u2014]+")
TOKEN = re.compile(r"\S+")


def digit_system(text):
    """Which digits this document writes: 'arabic', 'thai', or None (too few digits / truly mixed, e.g. Mahidol)."""
    a, t = len(re.findall("[0-9]", text)), len(re.findall("[๐-๙]", text))
    if a + t < 50:
        return None
    return "arabic" if a >= 0.9 * (a + t) else "thai" if t >= 0.9 * (a + t) else None


def is_suspect(token, system=None):
    core = token.strip("()[]{}.,;:*#")
    if MIXED_DIGITS.search(core):
        return "mixed_digits"                                               # S1 04 + Thai digits
    if system == "arabic" and len(re.findall("[๐-๙]", core)) >= 5 \
            and not re.search("[ก-๏]", core):
        return "wrong_digit_system"     # S3 ๐๐๐๐๐๐๐ in an Arabic-digit document = x's read as Thai zero
    if system == "thai" and len(re.findall("[0-9]", core)) >= 5 and not re.search("[A-Za-z]", core):
        return "wrong_digit_system"     # S3 the other way round (English codes like SCBT 104 have letters)
    for piece in PIECES.split(core):
        if re.search("[0-9][xX]+[0-9]", piece):
            return "broken_placeholder"                 # digit-x-digit never exists in a code: 08x00, 08x2000xX
        xs = len(re.findall("[xX\u00d7]", piece))
        if xs < 2 or not (re.search("[0-9\u0e50-\u0e59]", piece) or xs * 2 >= len(piece) >= 3):
            continue                     # every OCR guess has 2+ x's; X5, exaa024, TEXT2CHART, Linux are not guesses
        if not CLEAN_PIECE.match(piece):
            return "broken_placeholder"                                     # S2 O4Xxxxxxx, 08x2000xX, O8xxmxx
    return None


def suspects(text, ocr=False):
    """Tokens that look like an OCR guess: [(token, reason)]. S3 only for OCR text: a text layer copies
    characters exactly, so a Thai-digit code there is what the document really says (ced.pdf has 20)."""
    system = digit_system(text) if ocr else None
    return [(m.group(0), r) for m in TOKEN.finditer(text) for r in [is_suspect(m.group(0), system)] if r]


def normalise(text, ocr=False):
    """ocr=True: also apply S3, using this text's own digit system (needs 50+ digits to decide)."""
    system = digit_system(text) if ocr else None
    t = text.translate(GLYPHS)                  # N3 glyph codes first: they are marks
    t = TOKEN.sub(lambda m: m.group(0) if is_suspect(m.group(0), system)
                  else m.group(0).translate(THAI_DIGITS), t)   # N1, never inside a SUSPECT token (left as read)
    t = t.translate(DASHES)                     # N2
    t = SPACE_BEFORE_MARK.sub("", t)            # N4 - before N3b, so "คํ า" first becomes "คํา"
    t = NIKHAHIT_AA.sub(SARA_AM, t)             # N3b
    return t


def comparable(text):
    """N7: for FINDING headings only (never stored): no spaces, no marks, ำ = า, Thai digits = Arabic."""
    t = normalise(text).replace(SARA_AM, SARA_AA)
    return MARKS.sub("", "".join(t.split()))


def damage(text):
    """Damage normalise() is meant to remove - all 0 after it. Suspect tokens are left as read ON PURPOSE,
    so they are not counted here (they are counted by suspects())."""
    text = TOKEN.sub(lambda m: "" if is_suspect(m.group(0)) else m.group(0), text)
    return {"glyph_codes": len(GLYPH_RE.findall(text)),
            "thai_digits": len(re.findall("[๐-๙]", text)),
            "odd_dashes": len(re.findall("[–—−‐‑]", text)),
            "space_before_mark": len(SPACE_BEFORE_MARK.findall(text)),
            "nikhahit_aa": len(NIKHAHIT_AA.findall(text))}


# ---------------------------------------------------------------- self-tests (real strings from the samples)

TESTS = [
    ("๓(๓-๐-๖)", "3(3-0-6)"),                                  # Mahidol Sci: ๓(๓-๐-๖)
    ("๒ (๒–๐–๔)", "2 (2-0-4)"),                      # Mahidol ICT: en-dash
    ("ครุศาสตรอุตสาหกรรม", "ครุศาสตร์อุตสาหกรรม"),                     # masters_2565: glyph for ์
    ("จําเปน", "จำเป็น"),                               # ํ+า and glyph for ็ -> จำเป็น
    ("ความรู ้", "ความรู้"),                                              # Chula: space before a mark
    ("หน้ า", "หน้า"),                                          # Chula: space before า
    ("คํ า", "คำ"),                                                  # Mahidol: ํ space า (rule order)
    ("ภาษาไทย ภาษาอังกฤษ", "ภาษาไทย ภาษาอังกฤษ"),                                 # a real word space stays
    ("ที่ ตั้ง", "ที่ ตั้ง"),                                   # space after a mark, before a consonant: stays
    ("020413100 3(2-2-5)", "020413100 3(2-2-5)"),                                 # clean text is not changed
    ("042\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50\u0e55 วิชาเลือก",
     "042\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50\u0e55 วิชาเลือก"),                    # OCR guess: NOT made into 0420000005
    ("CN202 SCBT 104 วพ.202", "CN202 SCBT 104 วพ.202"),                             # real codes with letters stay
    ("04xxxxxxx xx.xxx", "04xxxxxxx xx.xxx"),                                     # clean placeholders stay
]
SUSPECT_TESTS = [("04\u0e52\u0e50\u0e50\u0e50\u0e50\u0e55", "mixed_digits"), ("O4Xxxxxxx", "broken_placeholder"),
                 ("08x2000xX", "broken_placeholder"), ("O8xxmxx", "broken_placeholder"),
                 ("04xxxxxxx", None), ("xxxxxxx", None), ("xx.xxx", None), ("CN202", None),
                 ("3(x-x-x)", None), ("0204133xx", None), ("(240XXXX)", None), ("วพ.4xx", None),
                 ("3-1201-0155x-xxx", None), ("XXXXXXXXX", None), ("example", None), ("Linux", None),
                 ("O8xxxxxxx", "broken_placeholder"), ("08x00", "broken_placeholder"), ("X5", None), ("exaa024", None), ("TEXT2CHART:", None),
                 ("\u0e50\u0e50\u0e53\u0e54\u2013x-xxx-x", None),
                 ("\u0e53(\u0e53-\u0e50-\u0e56)", None), ("2566", None)]
COMPARABLE_TESTS = [
    ("ชั้นปีที่ ๑", "ชนปท1"),          # ชั้นปีที่ ๑
    ("ชั้นปที่ ๑", "ชนปท1"),           # ี lost (Mahidol ICT)
    ("ชั้นป�ที่ ๑", "ชนปท1"),      # U+FFFD (Mahidol Sci)
    ("ปี ที่ 1", "ปท1"),                         # space inside (Chula)
    ("ภาคการศึกษาต้น", "ภาคการศกษาตน"),
    ("ภาคการศึกษาฤดูรอ น", "ภาคการศกษาฤดรอน"),        # space inside + ้ lost
]


ARABIC_DOC = "020413100 3(2-2-5) " * 10                      # enough Arabic digits to decide the system
SYSTEM_TESTS = [                                                # (token, document system, expected)
    ("\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50", "arabic", "wrong_digit_system"),   # ๐๐๐๐๐๐๐ = x's
    ("\u0e52\u0e55\u0e55\u0e59", "arabic", None),                                # a date ๒๕๕๙ (4 digits)
    ("\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50", "thai", None),             # normal in a Thai-digit doc
    ("\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50\u0e50", None, None),               # mixed doc (Mahidol): no S3
    ("0000000", "thai", "wrong_digit_system"),
    ("SCBT 104", "thai", None),
]


def self_test():
    bad = [(a, normalise(a), b) for a, b in TESTS if normalise(a) != b]
    bad += [(a, comparable(a), b) for a, b in COMPARABLE_TESTS if comparable(a) != b]
    bad += [(a, is_suspect(a), b) for a, b in SUSPECT_TESTS if is_suspect(a) != b]
    bad += [(a, is_suspect(a, sy), b) for a, sy, b in SYSTEM_TESTS if is_suspect(a, sy) != b]
    doc = ARABIC_DOC + "\u0e50" * 7
    if digit_system(ARABIC_DOC) != "arabic" or "\u0e50" * 7 not in normalise(doc, ocr=True) \
            or "\u0e50" * 7 in normalise(doc):
        bad.append(("ARABIC_DOC", "S3 must apply to OCR text only", "kept as read in OCR, converted in text layer"))
    return bad


if __name__ == "__main__":
    fails = self_test()
    for a, got, want in fails:
        print("FAIL %r -> %r (want %r)" % (a, got, want))
    n = len(TESTS) + len(COMPARABLE_TESTS) + len(SUSPECT_TESTS) + len(SYSTEM_TESTS) + 1
    print("%d of %d self-tests pass" % (n - len(fails), n))
