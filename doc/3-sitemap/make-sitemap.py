"""Draw sitemap.svg: every page, grouped by who sees it, plus the main paths between pages.
Run: python3 make-sitemap.py sitemap.svg   (source: sitemap.txt in this folder)"""
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
W = 1800
FONT = "'Noto Sans Thai', 'Noto Sans', 'DejaVu Sans', sans-serif"

C = {  # fill, stroke, title colour
    "public":  ("#f3f4f6", "#6b7280", "#374151"),
    "all":     ("#ede9fe", "#7c3aed", "#4c1d95"),
    "head":    ("#dbeafe", "#2563eb", "#1e3a8a"),
    "step":    ("#ffffff", "#2563eb", "#1e3a8a"),
    "teacher": ("#dcfce7", "#16a34a", "#14532d"),
    "admin":   ("#fef3c7", "#d97706", "#78350f"),
    "new":     ("#fff7ed", "#ea580c", "#9a3412"),
}
out = []


def text(x, y, s, size=14, weight="normal", color="#111827", anchor="start"):
    out.append('<text x="%d" y="%d" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s">%s</text>'
               % (x, y, size, weight, color, anchor, escape(s)))


def tags_row(x, y, tags, stroke, tcol):
    for t in tags:
        tw = 10 + 8 * len(t)
        out.append('<rect x="%d" y="%d" width="%d" height="20" rx="10" fill="#ffffff" stroke="%s"/>' % (x, y, tw, stroke))
        text(x + tw // 2, y + 15, t, 12, "bold", tcol, "middle")
        x += tw + 6


def box(x, y, w, title, lines, kind, tags=(), dashed=False, line_h=19, title_size=16):
    fill, stroke, tcol = C[kind]
    h = 34 + line_h * len(lines) + (24 if tags else 0) + 6
    dash = ' stroke-dasharray="7 5"' if dashed else ""
    out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="%s" stroke="%s" stroke-width="2"%s/>'
               % (x, y, w, h, fill, stroke, dash))
    text(x + 14, y + 23, title, title_size, "bold", tcol)
    for i, ln in enumerate(lines):
        text(x + 14, y + 46 + i * line_h, ln, 13.5, color="#1f2937")
    if tags:
        tags_row(x + 14, y + 46 + len(lines) * line_h - 4, tags, stroke, tcol)
    return y + h


def column_title(x, w, s, sub, kind, y=112):
    fill, stroke, tcol = C[kind]
    out.append('<rect x="%d" y="%d" width="%d" height="46" rx="8" fill="%s"/>' % (x, y, w, stroke))
    text(x + w // 2, y + 29, s, 19, "bold", "#ffffff", "middle")
    text(x + w // 2, y + 66, sub, 13, color="#4b5563", anchor="middle")


# ---- header
text(W // 2, 46, "Timetable System - Sitemap", 30, "bold", "#111827", "middle")
text(W // 2, 78, "Every page, grouped by who sees it. Tags (A3, B2, C2) = the journey stage the page serves. "
     "Self-hosted: one install = one institution.", 15, color="#374151", anchor="middle")

G = 12
TOP = 192

# ---- column 1: public + every page after login
x1, w1 = 30, 300
column_title(x1, w1, "PUBLIC", "not logged in", "public")
y = TOP
y = box(x1, y, w1, "0.0 First-run setup", ["shown ONCE after install:", "institution, first admin"], "public", dashed=True) + G
y = box(x1, y, w1, "0.1 Login", ["built-in accounts"], "public") + G
y = box(x1, y, w1, "0.2 Reset password", ["by email link"], "public") + G
y = box(x1, y, w1, "0.3 Accept invite", ["set a password, or join with", "an account from another dept"], "public", ["A1", "B1"]) + G
y += 26
column_title(x1, w1, "EVERY USER", "top bar after login", "all", y)
y += 80
y = box(x1, y, w1, "Department switcher", ["one person can be head in one", "department, teacher in another"], "all") + G
y = box(x1, y, w1, "1.1 Notifications", ["invites, deadlines, changes,", "published timetables"], "all", ["A12", "B5"]) + G
y = box(x1, y, w1, "1.2 My account", ["name, password, language,", "email settings"], "all") + G
bottom = [y]

# ---- column 2: department head
x2, w2 = 350, 520
column_title(x2, w2, "DEPARTMENT HEAD", "builds the timetable, once per term", "head")
y = TOP
y = box(x2, y, w2, "2.1 Home", ['one button "Start this term\'s timetable"; what needs me now'], "head", ["A1"]) + G
y = box(x2, y, w2, "2.2 Profiles", ["one profile = this department, this term", "New | Copy from last term"], "head", ["A2"]) + G
y = box(x2, y, w2, "2.3 People & rooms", ["the department's teachers (invite) and own rooms -", "typed once, every term reuses them"], "head") + G
# the workspace: a big box holding the 9 steps
ws_top = y
steps = [("1 Setup", "name, term, upload, what we found", ["A3"]),
         ("2 Review data", "red values first, each with its page", ["A4"]),
         ("3 Availability round", "teachers give busy times, deadline", ["A5"]),
         ("4 Teacher input", "blockers, warnings, comments", ["A6"]),
         ("5 Rules + electives", "time grid, electives, pre-check", ["A7"]),
         ("6 Generate + arrange", "timetable grid, tray, pins", ["A8"]),
         ("7 Rooms + teachers", "assign, live A4 preview", ["A9"]),
         ("8 Teacher review", "change requests, direct edit", ["A10"]),
         ("9 Publish + print", "locked version, downloads", ["A11"])]
inner = []
iy = ws_top + 58
sw = (w2 - 3 * 12) // 2
for i, (t, d, tg) in enumerate(steps):
    col, row = i % 2, i // 2
    sx = x2 + 12 + col * (sw + 12)
    sy = iy + row * 92
    inner.append((sx, sy, sw, t, d, tg))
ws_h = 58 + 5 * 92 + 4
fill, stroke, tcol = C["head"]
out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="12" fill="%s" stroke="%s" stroke-width="2.5"/>'
           % (x2, ws_top, w2, ws_h, fill, stroke))
text(x2 + 14, ws_top + 25, "2.4 Profile workspace", 17, "bold", tcol)
text(x2 + 14, ws_top + 45, "a step bar on top; one tab per program x year (B.Ed. Y1, Transfer Y1 ...)", 13, color="#1f2937")
for sx, sy, sw_, t, d, tg in inner:
    box(sx, sy, sw_, t, [d], "step", tg, title_size=15)
y = ws_top + ws_h + G
y = box(x2, y, w2, "2.4.1 Format setup", ["only for an unknown PDF layout: name the columns once"], "head", ["A3"], dashed=True) + G
y = box(x2, y, w2, "2.4.2 Versions + change log", ["every version, who changed what; start a change after publish"], "head", ["A11", "A12"]) + G
bottom.append(y)

# ---- column 3: teacher
x3, w3 = 890, 420
column_title(x3, w3, "TEACHER", "gives availability, checks own timetable", "teacher")
y = TOP
y = box(x3, y, w3, "4.1 Home", ["what is due: deadline, items, review open"], "teacher", ["B1"]) + G
y = box(x3, y, w3, "4.2 My availability", ["weekly busy grid, subjects ranked,", "max hours per day - edit until the deadline"], "teacher", ["B2"]) + G
y = box(x3, y, w3, "4.3 My items", ["problems about me, with comment threads"], "teacher", ["B3"]) + G
y = box(x3, y, w3, "4.4 My timetable", ["only my classes: draft or published;", "print / download; request a change"], "teacher", ["B4", "B5"]) + G
y = box(x3, y, w3, "4.5 My requests", ["waiting / approved / rejected + note;", "changes the head made for me"], "teacher", ["B4"]) + G
bottom.append(y)

# ---- column 4: institution admin
x4, w4 = 1330, 440
column_title(x4, w4, "INSTITUTION ADMIN", "sets up the institution, runs the install", "admin")
y = TOP
y = box(x4, y, w4, "3.1 Admin home", ["who has published this term; update available?"], "admin", ["C3"]) + G
y = box(x4, y, w4, "3.2 Departments & heads", ["create departments, invite / remove heads"], "admin", ["C2", "C3"]) + G
y = box(x4, y, w4, "3.3 Shared rooms", ["rooms used by several departments"], "admin", ["C2"]) + G
y = box(x4, y, w4, "3.4 Academic calendar", ["term dates and holidays - profiles pick", "their term here, not from the PDF"], "new") + G
y = box(x4, y, w4, "3.5 Curriculum formats", ["formats from the release + made here;", "approve, export to the open-source project"], "admin") + G
y = box(x4, y, w4, "3.6 System", ["backups, mail server (optional),", "version + updates, service status"], "admin") + G
bottom.append(y)

# ---- bottom band: main paths
by = max(bottom) + 26
paths = [("New term", "Login  >  2.1 Home  >  2.2 Copy from last term  >  2.4 steps 1 ... 9"),
         ("New teacher", "2.3 invite  >  email  >  0.3 Accept invite  >  4.1 Home"),
         ("Availability", "2.4 step 3 opens the round  >  1.1 notice  >  4.2 My availability  >  back in step 3"),
         ("Problems", "2.4 step 4  <>  4.3 My items   (the same comment thread, seen from both sides)"),
         ("Review", "2.4 step 8 sends the draft  >  4.4  >  4.5 request  >  step 8 approve / reject  >  1.1"),
         ("After publish", "2.4.2 start a change  >  new version  >  affected teachers get 1.1"),
         ("Unknown PDF", "2.4 step 1  >  2.4.1 Format setup  >  3.5 admin approves  >  (optional) export"),
         ("Install", "docker compose up  >  0.0 First-run setup  >  3.1 Admin home")]
bh = 54 + 26 * ((len(paths) + 1) // 2) + 8
out.append('<rect x="20" y="%d" width="%d" height="%d" rx="14" fill="none" stroke="#7c3aed" stroke-width="2.5" '
           'stroke-dasharray="10 6"/>' % (by, W - 40, bh))
text(40, by + 30, "MAIN PATHS BETWEEN PAGES", 18, "bold", "#4c1d95")
for i, (name, p) in enumerate(paths):
    px = 40 + (i % 2) * 870
    py = by + 62 + (i // 2) * 26
    text(px, py, name, 14, "bold", "#4c1d95")
    text(px + 120, py, p, 13.5, color="#1f2937")
# ---- legend
ly = by + bh + 34
text(40, ly, "Legend:", 14, "bold")
lx = 110
for kind, label in (("public", "public"), ("all", "every user"), ("head", "department head"), ("teacher", "teacher"),
                    ("admin", "institution admin"), ("new", "new in this version")):
    fill, stroke, _ = C[kind]
    out.append('<rect x="%d" y="%d" width="22" height="16" rx="4" fill="%s" stroke="%s" stroke-width="2"/>'
               % (lx, ly - 13, fill, stroke))
    text(lx + 30, ly, label, 13)
    lx += 52 + 8 * len(label)
text(W - 40, ly, "Dashed box = shown only sometimes", 13, color="#4b5563", anchor="end")
H = ly + 26

svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="%s">'
       '<rect width="100%%" height="100%%" fill="#ffffff"/>%s</svg>' % (W, H, W, H, FONT, "".join(out)))
open(OUT, "w", encoding="utf-8").write(svg)
print("wrote %s (%d x %d)" % (OUT, W, H))
