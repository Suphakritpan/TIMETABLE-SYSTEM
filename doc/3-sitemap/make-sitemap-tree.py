"""Draw sitemap-tree.svg: the classic sitemap tree - top page, one branch per type of user, pages hanging below.
Page names only (details are in sitemap.txt and the detailed diagram sitemap.svg).
Run: python3 make-sitemap-tree.py sitemap-tree.svg"""
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
FONT = "'Noto Sans Thai', 'Noto Sans', 'DejaVu Sans', sans-serif"
LINE = "#374151"

C = {  # branch box, page box, text colour
    "root":    ("#93c5fd", None, "#0f172a"),
    "public":  ("#d1d5db", "#f3f4f6", "#1f2937"),
    "all":     ("#c4b5fd", "#ede9fe", "#2e1065"),
    "head":    ("#93c5fd", "#dbeafe", "#172554"),
    "teacher": ("#86efac", "#dcfce7", "#052e16"),
    "admin":   ("#fcd34d", "#fef3c7", "#451a03"),
}
out = []


def text(x, y, s, size=14, weight="normal", color="#111827", anchor="middle"):
    out.append('<text x="%d" y="%d" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s">%s</text>'
               % (x, y, size, weight, color, anchor, escape(s)))


def rect(x, y, w, h, fill, stroke="#4b5563", dashed=False, sw=1.5):
    d = ' stroke-dasharray="6 4"' if dashed else ""
    out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="%s" stroke="%s" stroke-width="%s"%s/>'
               % (x, y, w, h, fill, stroke, sw, d))


def line(x1, y1, x2, y2):
    out.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1.6"/>' % (x1, y1, x2, y2, LINE))


def label(x, y, w, h, lines, size, color, weight="normal"):
    top = y + h / 2 - (len(lines) - 1) * size * 0.6 + size * 0.35
    for i, ln in enumerate(lines):
        text(x + w // 2, int(top + i * size * 1.2), ln, size, weight, color)


# ---- layout
COLS = [  # key, branch title lines, pages (name, sub-pages or None, dashed)
    ("public", ["Public", "(not logged in)"], [
        ("First-run setup", None, True), ("Login", None, False), ("Reset password", None, False),
        ("Accept invite", None, False)]),
    ("head", ["Department head", "(+ assistant)"], [
        ("Home", None, False), ("Profiles", None, False), ("People & rooms", None, False),
        ("Profile workspace", ["1 Setup", "2 Review data", "3 Availability round", "4 Teacher input",
                               "5 Rules + electives", "6 Generate + arrange", "7 Rooms + teachers",
                               "8 Teacher review", "9 Publish + print"], False),
        ("Format setup", None, True), ("Versions + change log", None, False)]),
    ("teacher", ["Teacher"], [
        ("Home", None, False), ("My availability", None, False), ("My items", None, False),
        ("My timetable", None, False), ("My requests", None, False)]),
    ("admin", ["Institution admin"], [
        ("Admin home", None, False), ("Departments & heads", None, False), ("Shared rooms", None, False),
        ("Academic calendar", None, False), ("Curriculum formats", None, False), ("System", None, False)]),
    ("all", ["Every user", "(top bar)"], [
        ("Department switcher", None, False), ("Notifications", None, False), ("My account", None, False)]),
]
BW, BH = 210, 64            # branch box
PW, PH = 190, 46            # page box
SW, SH = 170, 34            # step box (inside the workspace)
GAPX, STEP_Y, SUB_Y = 40, 62, 44
col_w = [max(BW, 48 + PW) if k != "head" else BW + 150 for k, _, _ in COLS]   # room for pages hanging right
W = 60 + sum(col_w) + GAPX * (len(COLS) - 1)

ROOT_Y, BR_Y = 92, 230
root_w, root_h = 260, 70
rx = W // 2 - root_w // 2
rect(rx, ROOT_Y, root_w, root_h, C["root"][0], "#1d4ed8", sw=2)
label(rx, ROOT_Y, root_w, root_h, ["Timetable System"], 20, C["root"][2], "bold")
text(rx + root_w // 2, ROOT_Y + root_h + 20, "one install = one institution", 12.5, color="#4b5563")

# horizontal bus from the root to every branch
xs, x = [], 30
for w in col_w:
    xs.append(x)
    x += w + GAPX
bus_y = BR_Y - 34
line(W // 2, ROOT_Y + root_h + 28, W // 2, bus_y)
line(xs[0] + BW // 2, bus_y, xs[-1] + BW // 2, bus_y)

bottom = 0
for (key, title, pages), x0 in zip(COLS, xs):
    branch, page, tcol = C[key]
    cx = x0 + BW // 2
    line(cx, bus_y, cx, BR_Y)
    rect(x0, BR_Y, BW, BH, branch, sw=2)
    label(x0, BR_Y, BW, BH, title, 17 if len(title) == 1 else 16, tcol, "bold")
    # pages hang off a vertical spine on the left side of the branch box, like the example
    spine_x = x0 + 26
    y = BR_Y + BH + 26
    last_mid = y
    for name, subs, dashed in pages:
        px = spine_x + 22
        rect(px, y, PW, PH, page, dashed=dashed)
        label(px, y, PW, PH, [name], 14, tcol)
        mid = y + PH // 2
        line(spine_x, mid, px, mid)
        last_mid = mid
        y += PH
        if subs:                                       # the 9 steps hang off a second spine
            sub_spine = px + 22
            sy = y + 14
            for s in subs:
                sx = sub_spine + 20
                rect(sx, sy, SW, SH, "#ffffff", stroke="#2563eb")
                label(sx, sy, SW, SH, [s], 13, tcol)
                line(sub_spine, sy + SH // 2, sx, sy + SH // 2)
                sub_last = sy + SH // 2
                sy += SH + 10
            line(sub_spine, y, sub_spine, sub_last)
            y = sy + 4
        y += STEP_Y - PH
    line(spine_x, BR_Y + BH, spine_x, last_mid)
    bottom = max(bottom, y)

# ---- title, legend
text(W // 2, 46, "Timetable System - Sitemap", 28, "bold", "#111827")
ly = bottom + 24
text(30, ly, "Dashed box = a page shown only sometimes (once after install; only for an unknown PDF layout).  "
     "Details of every page: sitemap.txt and the detailed diagram sitemap.png.", 13, color="#4b5563", anchor="start")
H = ly + 24

svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="%s">'
       '<rect width="100%%" height="100%%" fill="#e5e7eb"/>%s</svg>' % (W, H, W, H, FONT, "".join(out)))
open(OUT, "w", encoding="utf-8").write(svg)
print("wrote %s (%d x %d)" % (OUT, W, H))
