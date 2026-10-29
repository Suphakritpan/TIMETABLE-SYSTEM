"""Read one curriculum file and write a review page you can open in a browser.

    python3 -m importer FILE [--format NAME] [--out PAGE.html]   (no --format: every format is tried, the best kept)
(run from engine/)

Scanned pages go through OCR + the glyph pass; text pages are read directly. Nothing is guessed: values the
reader is not sure of are RED with their reason, values worth a look are AMBER.
"""
import argparse
import html
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from importer import formats                      # noqa: E402
from importer.convert import NotADocument, convert  # noqa: E402


def page(name, doc, glyph, out, secs):
    checks = {}
    for c in out["checks"]:
        checks.setdefault((c.get("page"), c.get("code")), []).append(c)
    red = sum(1 for c in out["checks"] if c["level"] == "red")
    amber = sum(1 for c in out["checks"] if c["level"] == "amber")
    rows_html, last = [], None
    for r in out["rows"]:
        key = (r["plan"], r["year"], r["term"])
        if key != last:
            rows_html.append("<tr class=h><td colspan=7>%s &middot; ปีที่ %s ภาคการศึกษาที่ %s</td></tr>"
                             % (html.escape(r["plan"][:60]), r["year"], r["term"]))
            last = key
        cs = checks.get((r["page"], r["code"]), [])
        lvl = "red" if any(c["level"] == "red" for c in cs) else ("amber" if cs else "")
        hours = "-".join("x" if r[k] is None else str(r[k]) for k in ("lecture", "lab", "self_study"))
        credit = "%s(%s)" % (r["credits"], hours) if r["credits"] is not None else "?"
        if r.get("field_hours"):
            credit = "%s(%s hours)" % (r["credits"], r["field_hours"])
        rows_html.append("<tr class=%s><td>%s%s</td><td>%s<div class=en>%s</div></td><td>%s</td><td>%s</td><td>p.%s</td>"
                         "<td class=src>%s</td><td class=why>%s</td></tr>" % (
                             lvl, html.escape(r["code"]), html.escape(r.get("mark", "")), html.escape(r["name_th"]),
                             html.escape(r.get("name_en", "")), "slot" if r["kind"] == "slot" else "course", credit,
                             r["page"], r.get("source", ""), "<br>".join(html.escape(c["reason"]) for c in cs)))
    other = [c for c in out["checks"] if not c.get("code")]
    doc_html = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Curriculum Review</title><style>
:root{--bg:#e9e5dd;--surface:#f2efe9;--surface-2:#e0dbd1;--line:#cbc4b7;--ink:#2a2926;--mute:#6b665d;--accent:#2f5d62;
 --red:#a33b2b;--red-soft:#f0d8d1;--amber:#8a5d0c;--amber-soft:#efe1c2}
@media (prefers-color-scheme:dark){:root{--bg:#1d1c1a;--surface:#272523;--surface-2:#312e2a;--line:#45413a;--ink:#ebe6dd;
 --mute:#a19b90;--accent:#7fb2ad;--red:#e59a8b;--red-soft:#43241e;--amber:#e0bd72;--amber-soft:#3d3118}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.5 "Noto Sans Thai",system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}.mute{color:var(--mute);font-size:12.5px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.card b{font-size:20px;display:block}.card.r b{color:var(--red)}.card.a b{color:var(--amber)}
table{border-collapse:collapse;width:100%%;background:var(--surface);border:1px solid var(--line);border-radius:8px}
td{border-bottom:1px solid var(--line);padding:6px 9px;vertical-align:top;font-size:13.5px}
tr.h td{background:var(--surface-2);font-weight:700;color:var(--accent)}
tr.red td{background:var(--red-soft)}tr.red td.why{color:var(--red);font-weight:600}
tr.amber td.why{color:var(--amber)}.en{color:var(--mute);font-size:12px}.src{color:var(--mute);font-size:11.5px}
.why{font-size:12.5px;max-width:320px}
</style>
<h1>%s</h1><div class=mute>%s &middot; %d pages (%d scanned) &middot; read in %.1f s</div>
<div class=cards><div class=card><b>%d</b>plan rows</div><div class="card r"><b>%d</b>red: the head must decide</div>
<div class="card a"><b>%d</b>amber: worth a look</div><div class=card><b>%d</b>terms</div><div class=card><b>%d</b>courses in the course list</div>
<div class=card><b>%s</b>glyph pass on scans: %s accepted, %s doubted</div></div>
%s<table>%s</table>""" % (
        html.escape(name), doc.file_type, len(doc.pages), sum(1 for p in doc.pages if p.kind == "scan"), secs,
        len(out["rows"]), red, amber, len({(p, y, t) for p, y, t in out["terms"]}), len(out["subjects"]),
        glyph["scan_pages"], glyph["accepted"], glyph["doubted"],
        ("<p class=mute>Other checks: " + "; ".join(html.escape(c["reason"]) for c in other) + "</p>") if other else "",
        "".join(rows_html))
    return doc_html


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--format", help="a file name in importer/formats/ (without .json); default: the best one")
    ap.add_argument("--out", help="where to write the review page (default: work/review-<file>.html)")
    a = ap.parse_args()
    path = Path(a.file).expanduser()
    t0 = time.time()
    try:
        doc = convert(path)
    except NotADocument as e:
        sys.exit("cannot read %s: %s" % (path.name, e))
    got = formats.read(doc, path, name=a.format)
    if got["format"] is None:
        sys.exit("%s: not a curriculum - no study plan and no course list with hours found (scores %s)"
                 % (path.name, got["scores"]))
    if got.get("list_only"):                        # a course list: subjects, no term plan (the planner picks terms)
        subs = got["result"]["subjects"]
        for code, s in subs.items():
            print("  %-12s %s-%s-%s %-11s %s" % (code, s.get("lecture"), s.get("lab"), s.get("credits"),
                                               s["choice"], s["name_th"]))
        print("%s: COURSE LIST (no term plan) | format %s | %d subjects, %d elective, %d conditional, %d red | %.1f s"
              % (path.name, got["format"], len(subs), sum(s["choice"] == "elective" for s in subs.values()),
                 sum(s["choice"] == "conditional" for s in subs.values()),
                 sum(c["level"] == "red" for c in got["result"]["checks"]), time.time() - t0))
        return
    glyph, out = got["glyph"], got["result"]
    secs = time.time() - t0
    dest = Path(a.out).expanduser() if a.out else HERE.parent.parent / "work" / ("review-%s.html" % path.stem)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(page(path.name, doc, glyph, out, secs), encoding="utf-8")
    red = sum(1 for c in out["checks"] if c["level"] == "red")
    print("%s: %s, %d pages | format %s | %d plan rows, %d red, %d amber | %.1f s" % (path.name, doc.file_type, len(doc.pages),
          got["format"], len(out["rows"]), red, sum(1 for c in out["checks"] if c["level"] == "amber"), secs))
    print("review page:", dest)


if __name__ == "__main__":
    main()
