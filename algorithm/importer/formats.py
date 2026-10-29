"""FORMAT DEFINITIONS: the facts about how a curriculum is printed, as data (formats/*.json), never as code.

A format may "extends" another: the shared base (tqf2-th = the Thai TQF layout, มคอ.2) holds the headings, years,
terms, totals and the credit shape; an institution's format adds its course-code shapes and elective groups.
pick() reads a document with every institution format and keeps the one that reads it best - nobody has to know
which format a file is in.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent / "formats"


def resolve(name, defs):
    """The full format: its own facts over everything it extends. defs = {name: raw format dict}."""
    raw = defs[name]
    parent = resolve(raw["extends"], defs) if raw.get("extends") else {}
    return {**parent, **{k: v for k, v in raw.items() if k != "extends"}}


def shipped():
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(HERE.glob("*.json"))}


def institution_formats(defs):
    """The formats that can read a file: those with a course-code shape (a base alone cannot)."""
    return [n for n in defs if "code" in resolve(n, defs)]


def score(result):
    """How well a format read a document: rows read, minus the red values it could not settle."""
    reds = sum(1 for c in result["checks"] if c["level"] == "red")
    return len(result["rows"]) - 2 * reds


def pick(doc, defs, pdf=None):
    """(best format name, its reading, every format's score). None when no format reads a single plan row."""
    from .reader import Reader
    from .progress import report
    tried = {}
    for name in institution_formats(defs):
        tried[name] = Reader(resolve(name, defs), pdf).read(doc)
        report("format", name=name, label=resolve(name, defs).get("name", name), rows=len(tried[name]["rows"]),
               score=score(tried[name]))
    scores = {n: score(r) for n, r in tried.items()}
    # a format that reads rows always beats one that reads none (raw OCR of a scan can have many reds before the
    # cell pass; measured on Chonburi: -127 against 0 for formats that read nothing)
    best = max(scores, key=lambda n: (bool(tried[n]["rows"]), scores[n], len(tried[n]["subjects"])), default=None)
    if best is None or not tried[best]["rows"]:
        return list_only(doc, defs, pdf, scores)
    return best, tried[best], scores


def list_only(doc, defs, pdf, scores, least=5):
    """No format reads a term plan: is it a COURSE LIST (subjects with hours, no terms)? The format that finds the most
    subjects reads it; fewer than `least` = not a curriculum at all (e.g. a list of program names)."""
    from .reader import Reader
    from .progress import report
    got = {}
    for n in institution_formats(defs):
        got[n] = Reader(resolve(n, defs), pdf).list_only(doc)
        report("format", name=n, label=resolve(n, defs).get("name", n), subjects=len(got[n]["subjects"]), mode="list")
    best = max(got, key=lambda n: (len(got[n]["subjects"]), -len(got[n]["checks"])), default=None)
    if best is None or len(got[best]["subjects"]) < least:
        return None, None, scores
    return best, got[best], {**scores, best: "list: %d subjects" % len(got[best]["subjects"])}


def read(doc, pdf, defs=None, name=None):
    """Read a converted document: the given format, or the best one. Scanned pages get the glyph pass with the
    format's code shapes first, and ruled tables with hours in columns the cell pass (both change the words in
    place), then the reading is done again.
    Returns {"format", "result", "glyph", "scores"}; format None = no format reads this file (a new one is needed)."""
    from . import glyphread
    from .progress import report
    from .reader import Reader
    defs = defs or shipped()
    scores = {}
    report("stage", name="format", state="start")
    if name is None:
        name, got, scores = pick(doc, defs, pdf)
        if name is None:
            report("stage", name="format", state="done", chosen=None)
            return {"format": None, "result": None, "glyph": None, "scores": scores}
        if got.get("list_only"):
            report("stage", name="format", state="done", chosen=name, mode="list")
            return {"format": name, "result": got, "glyph": None, "scores": scores, "list_only": True}
    report("stage", name="format", state="done", chosen=name, mode="plan")
    fmt = resolve(name, defs)
    report("stage", name="reread", state="start")
    glyph = glyphread.apply(doc, fmt, pdf)
    if fmt.get("credit_columns"):                     # ruled tables with hours in columns: read the cells again
        from . import cells
        glyph = {**glyph, "cells": cells.apply(doc, fmt, pdf)}
    report("stage", name="reread", state="done", **{k: v for k, v in glyph.items() if isinstance(v, (int, float))})
    report("stage", name="rows", state="start")
    result = Reader(fmt, pdf).read(doc)
    report("stage", name="rows", state="done", rows=len(result["rows"]))
    return {"format": name, "result": result, "glyph": glyph, "scores": scores}
