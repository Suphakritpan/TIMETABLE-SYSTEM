"""DOCUMENT: the one shape every converter produces (spec, zone 2). The reader never knows the file type.

A document is pages -> lines -> words; every word keeps its box on the page (in points, 1/72 inch) so the
review page can highlight it, and its raw text next to the normalised text (og vs normalised, never lost).
"""
from dataclasses import asdict, dataclass, field


@dataclass
class Word:
    raw: str                 # exactly as the converter gave it
    text: str                # normalised (Thai digits, dashes, glyph codes...) - what the reader uses
    box: tuple               # (x0, y0, x1, y1) in points
    conf: float = 100.0      # 100 for a text layer; OCR confidence otherwise
    source: str = "text"     # text | ocr | glyph
    doubt: str = ""          # why this value is NOT trusted (set by the glyph pass) -> a red value in Review


@dataclass
class Line:
    page: int
    words: list

    @property
    def text(self):
        return " ".join(w.text for w in self.words)

    @property
    def y(self):
        return sum((w.box[1] + w.box[3]) / 2 for w in self.words) / len(self.words)


@dataclass
class Page:
    number: int
    width: float
    height: float
    kind: str                # text | scan | blank
    lines: list = field(default_factory=list)


@dataclass
class Document:
    pages: list
    file_type: str           # pdf-text | pdf-mixed | pdf-scan | docx | xlsx | image ...
    converter: str           # e.g. "pdftotext 24.02.0 + normalise 1"
    sha256: str = ""

    def page(self, n):
        return self.pages[n - 1]


def to_dict(doc):
    """The document as plain data (stored as the normalised_upload next to the og_upload)."""
    return asdict(doc)


def from_dict(d):
    pages = [Page(p["number"], p["width"], p["height"], p["kind"],
                  [Line(l["page"], [Word(**{**w, "box": tuple(w["box"])}) for w in l["words"]]) for l in p["lines"]])
             for p in d["pages"]]
    return Document(pages, d["file_type"], d["converter"], d.get("sha256", ""))
