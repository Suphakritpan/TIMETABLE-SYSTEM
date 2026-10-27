"""Draw users-goals-map.svg: users -> goals -> tech stack, plus the parts that belong to both."""
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
W = 1800
FONT = "'Noto Sans Thai', 'Noto Sans', 'DejaVu Sans', sans-serif"

C = {  # fill, stroke, title colour
    "ug":   ("#dbeafe", "#2563eb", "#1e3a8a"),
    "tech": ("#dcfce7", "#16a34a", "#14532d"),
    "both": ("#ede9fe", "#7c3aed", "#4c1d95"),
    "gap":  ("#fff7ed", "#ea580c", "#9a3412"),
    "none": ("#f3f4f6", "#6b7280", "#374151"),
    "never": ("#fee2e2", "#dc2626", "#7f1d1d"),
}
out = []


def text(x, y, s, size=14, weight="normal", color="#111827", anchor="start"):
    out.append('<text x="%d" y="%d" font-size="%d" font-weight="%s" fill="%s" text-anchor="%s">%s</text>'
               % (x, y, size, weight, color, anchor, escape(s)))


def box(x, y, w, title, lines, kind, tags=(), dashed=False, line_h=19):
    fill, stroke, tcol = C[kind]
    h = 34 + line_h * len(lines) + (24 if tags else 0) + 8
    dash = ' stroke-dasharray="7 5"' if dashed else ""
    out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="%s" stroke="%s" stroke-width="2"%s/>'
               % (x, y, w, h, fill, stroke, dash))
    text(x + 14, y + 23, title, 16, "bold", tcol)
    for i, ln in enumerate(lines):
        text(x + 14, y + 46 + i * line_h, ln, 13.5, color="#1f2937")
    if tags:
        tx = x + 14
        ty = y + 46 + len(lines) * line_h - 4
        for t in tags:
            tw = 10 + 8 * len(t)
            out.append('<rect x="%d" y="%d" width="%d" height="20" rx="10" fill="#ffffff" stroke="%s"/>'
                       % (tx, ty, tw, stroke))
            text(tx + tw // 2, ty + 15, t, 12, "bold", tcol, "middle")
            tx += tw + 6
    return y + h


def column_title(x, w, s, sub, kind):
    fill, stroke, tcol = C[kind]
    out.append('<rect x="%d" y="112" width="%d" height="46" rx="8" fill="%s"/>' % (x, w, stroke))
    text(x + w // 2, 141, s, 19, "bold", "#ffffff", "middle")
    text(x + w // 2, 178, sub, 13, color="#4b5563", anchor="middle")


# ---- header
text(W // 2, 46, "Timetable System - Users & Goals  x  Tech Stack", 30, "bold", "#111827", "middle")
text(W // 2, 78, "Who uses it, what they need, and which part of the tech stack serves each need. "
     "Final product: open source, self-hosted by any institution in the country.", 15, color="#374151", anchor="middle")

GAP = 12
# ---- column 1: users
x1, w1 = 30, 470
column_title(x1, w1, "USERS", "from users-and-goals.txt", "ug")
y = 192
y = box(x1, y, w1, "Department head  (MAIN user)", [
    "Builds the timetable for the chosen years, once per term",
    "Runs the teacher availability round, approves changes,",
    "publishes and prints",
    "Uses: every page of the web app"], "ug", ["G1", "G2", "G3", "G4", "G5", "G6"]) + GAP
y = box(x1, y, w1, "Teacher", [
    "Gives busy times, subjects they can teach, max hours/day",
    "Sees ONLY their own timetable, sends change requests",
    "Invited by a department head"], "ug", ["T1", "T2"]) + GAP
y = box(x1, y, w1, "Institution admin", [
    "Creates departments, invites department heads",
    "Enters rooms shared by several departments"], "ug", ["I1"]) + GAP
y = box(x1, y, w1, "Other departments", [
    "Same as a department head, in their own profiles",
    "Their published timetables book shared rooms"], "ug", ["I1"]) + GAP
y = box(x1, y, w1, "Students  (NOT a user - no account, ever)", [
    "Receive the published timetable of their group",
    "as an A4 print or file"], "none", ["G5"], dashed=True) + GAP
y = box(x1, y, w1, "The problem today", [
    "Excel + paper, nothing automated",
    "3 days - 1 week per term, mostly teachers negotiating",
    "Changes keep coming after the 'final' table"], "none")
col_bottom = [y]

# ---- column 2: goals
x2, w2 = 530, 520
column_title(x2, w2, "GOALS", "what each user needs to get done", "ug")
y = 192
goals = [
    ("G1  Clash-free timetable", ["For every group in the chosen years"]),
    ("G2  Much faster than 3 days - 1 week", ["Target: under 30 min of work, then as fast as possible"]),
    ("G3  Stay in control", ["Move classes, pin agreed ones, Schedule / Reserve electives"]),
    ("G4  Trust the data from the PDF", ["See and fix what was read before it spreads"]),
    ("G5  Official-looking A4 print", ["College name, group, subject list, weekly grid"]),
    ("G6  Reuse work next term", ["Keep profiles, teachers, rooms, rules"]),
    ("T1  Teacher: wishes respected", ["Busy times and preferred subjects are used by the solver"]),
    ("T2  Teacher: told about changes", ["Review, change requests, notifications, versions"]),
    ("I1  Admin: no double-booked shared rooms", ["Across departments of one institution"]),
]
for t, ls in goals:
    y = box(x2, y, w2, t, ls, "ug", line_h=18) + 8
y += 6
y = box(x2, y, w2, "MUST NEVER", [
    "N1  change a timetable without the user asking",
    "N2  show teachers' data outside the institution",
    "N3  let students in"], "never", ["N1", "N2", "N3"])
col_bottom.append(y)

# ---- column 3: tech stack
x3, w3 = 1080, 690
column_title(x3, w3, "TECH STACK", "from tech-stack-list.txt - what each part is used for", "tech")
y = 192
tech = [
    ("web  -  React + Vite + TypeScript + dnd-kit (nginx)", [
        "All pages: profile manager, review, arrange (drag & drop),",
        "availability grid, print preview"], ["G2", "G3", "G5", "T1"], "tech", False),
    ("project service  -  FastAPI (the ONLY writer of data)", [
        "Profiles, availability rounds, change requests, versions, change log"],
        ["G2", "G6", "T2", "N1"], "tech", False),
    ("import service  -  pdftotext + curriculum format readers", [
        "Reads the PDF into subjects; every value keeps its PDF page"], ["G4"], "tech", False),
    ("solver service  -  FET (fet-cl, pinned version)", [
        "Places classes in < 1 s; pins; N candidates; partial result + tray",
        "Teacher rules = CORE (busy times, max hours)"], ["G1", "G2", "G3", "T1"], "tech", False),
    ("core lib  -  Python rules, pre-check, rule checker", [
        "Explains impossible cases before running; re-checks every result;",
        "answers the live check on each drop (POST /api/check)"], ["G1", "G3"], "tech", False),
    ("storage  -  JSON files now -> PostgreSQL (Docker, later)", [
        "Profiles, rooms, teachers, runs; stays on the institution's server"],
        ["G6", "I1", "N2"], "tech", False),
    ("Docker Compose  -  self-hosted install (final product)", [
        "docker compose up; one-command update; HTTPS, backups, PDPA"], ["N2"], "tech", False),
    ("auth / login  -  PROPOSED: built-in accounts", [
        "Roles: institution admin, head, teacher (no student)"],
        ["N2", "N3", "T1"], "gap", True),
    ("notifications  -  PROPOSED: in-app + optional email", [
        "Email only if the admin sets a mail server: invites, deadlines, changes"], ["T2"], "gap", True),
]
for t, ls, tags, kind, dashed in tech:
    y = box(x3, y, w3, t, ls, kind, tags, dashed, line_h=18) + 9
col_bottom.append(y)

# ---- bottom band: parts that belong to both
by = max(col_bottom) + 40
out.append('<rect x="20" y="%d" width="%d" height="%d" rx="14" fill="none" stroke="%s" stroke-width="2.5" '
           'stroke-dasharray="10 6"/>' % (by - 14, W - 40, 180, C["both"][1]))
text(40, by + 14, "BELONGS TO BOTH  -  a user need that also needs a specific tech piece", 18, "bold", C["both"][2])
gap, bx = 12, 40
bw = (W - 2 * bx - 5 * gap) // 6
both = [
    ("Login + roles", ["Users: all personnel", "Tech: built-in accounts", "+ role check in project"]),
    ("Availability round", ["Users: head + teachers", "Tech: web + project", "+ teacher rules in FET"]),
    ("Live check on drop", ["Users: head", "Tech: dnd-kit + /api/check", "+ core lib checker"]),
    ("A4 print preview", ["Users: head -> students", "Tech: web print layout", "+ Thai font"]),
    ("Versions + change log", ["Users: head + teachers", "Tech: project service", "+ storage"]),
    ("Copy from last term", ["Users: head", "Tech: profile manager", "+ storage"]),
]
for i, (t, ls) in enumerate(both):
    box(bx + i * (bw + gap), by + 30, bw, t, ls, "both", line_h=19)

# ---- legend
ly = by + 200
H = ly + 30
items = [("ug", "from Users & Goals"), ("tech", "from Tech stack"), ("both", "belongs to both"),
         ("gap", "gap - not chosen yet"), ("never", "must never"), ("none", "context / no access")]
lx = 40
text(lx, ly + 4, "Legend:", 14, "bold")
lx += 70
for k, label in items:
    out.append('<rect x="%d" y="%d" width="22" height="16" rx="4" fill="%s" stroke="%s" stroke-width="2"/>'
               % (lx, ly - 9, C[k][0], C[k][1]))
    text(lx + 30, ly + 4, label, 13.5)
    lx += 48 + 8 * len(label)
text(W - 40, ly + 4, "Tags (G1, T1, N2 ...) link a user or tech part to the goal it serves", 13.5,
     color="#4b5563", anchor="end")

svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="%s">'
       '<rect width="100%%" height="100%%" fill="#ffffff"/>%s</svg>' % (W, H, W, H, FONT, "".join(out)))
open(OUT, "w", encoding="utf-8").write(svg)
print("bottom of columns ok; wrote", OUT)
