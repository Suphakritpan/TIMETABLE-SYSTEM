"""Draw every user flow as a flowchart: flows/F1.svg ... flows/F12.svg (source: user-flows.txt).
Main path runs down; a decision's other answer branches to the right and either ends or goes back.
Run: python3 make-flows.py            (then render PNGs, see README.txt)"""
from pathlib import Path
from xml.sax.saxutils import escape

FONT = "'Noto Sans Thai', 'Noto Sans', 'DejaVu Sans', sans-serif"
OUT = Path(__file__).resolve().parent / "flows"
KIND = {  # fill, stroke
    "start": ("#e0e7ff", "#4338ca"), "end": ("#dcfce7", "#15803d"), "page": ("#dbeafe", "#2563eb"),
    "act": ("#ffffff", "#4b5563"), "ask": ("#fef3c7", "#d97706"), "bad": ("#fee2e2", "#dc2626"),
    "back": ("#f3f4f6", "#6b7280"),
}

# a flow = (id, title, who, steps). step = (kind, text) or ("ask", question, [branch steps], branch answer label)
#   main path continues with the "yes"/main answer; the branch is the other answer
FLOWS = [
    ("F1", "Set up the institution", "ADMIN, once", [
        ("start", "docker compose up"), ("page", "0.0 First-run setup"), ("act", "institution name, language, first admin"),
        ("page", "3.4 Academic calendar: terms, holidays"), ("page", "3.2 Departments & heads"), ("act", "add a department, invite its head"),
        ("ask", "mail server set in 3.6?", [("act", "show an invite LINK to copy"), ("back", "send it by hand")], "no"),
        ("act", "invite email sent"), ("page", "3.3 Shared rooms"), ("end", "institution ready (3.1 shows each department)")]),
    ("F2", "Join by invite", "HEAD, ASSIST or TEACHER", [
        ("start", "open the invite link"),
        ("ask", "link still valid?", [("bad", "expired: ask for a new one"), ("end", "no account made")], "no"),
        ("page", "0.3 Accept invite"),
        ("ask", "already has an account?", [("act", "set name + password"), ("back", "account made, continue")], "no"),
        ("act", "log in: department added to the switcher"), ("end", "Home of the invited role (+ 3-step intro)")]),
    ("F3", "Start this term's timetable", "HEAD or ASSIST", [
        ("start", "2.1 Home: Start this term's timetable"),
        ("ask", "last term's profile exists?", [("act", "2.2 New profile"), ("back", "continue at Setup")], "no"),
        ("act", "2.2 Copy from last term (people, rooms, rules, programs)"), ("page", "2.4 step 1 Setup"),
        ("ask", "term is in the academic calendar?", [("bad", "ask the admin to add it (3.4)"), ("end", "head cannot type dates")], "no"),
        ("act", "choose the programs: B.Ed., transfer, M.Ed., Ph.D."), ("act", "upload each program's file(s) -> F4"),
        ("end", "tabs: program x year, steps not started")]),
    ("F4", "Upload and read a curriculum file", "HEAD or ASSIST", [
        ("start", "step 1: upload a file"), ("act", "store og_upload (never changed)"),
        ("ask", "a real document? (by content)", [("bad", "cannot be read: reason shown"), ("end", "nothing saved")], "no"),
        ("act", "text: convert + normalise | scan: OCR + glyph tool -> normalised_upload"),
        ("ask", "known format?", [("page", "2.4.1 Format setup: mark the columns"), ("back", "unverified -> admin F11")], "no"),
        ("act", "What we found: format, years, terms - each with its page"), ("page", "step 2 Review data"),
        ("act", "sure values plain; unsure values RED + reason + page crop"),
        ("ask", "any red value left?", [("act", "next red: PDF opens at the spot"), ("back", "fix it or mark it right")], "yes"),
        ("end", "every row: program, year, term, code / slot, credits")]),
    ("F5", "Availability round", "HEAD opens, TEACHER answers", [
        ("start", "step 3: pick teachers, set a deadline, open"), ("act", "teachers notified (1.1, + email)"),
        ("page", "TEACHER 4.2 My availability"),
        ("ask", "filled in for another department?", [("act", "busy grid, rank subjects, max hours"), ("back", "submit")], "no"),
        ("act", "same grid shown (once per person); rank this department's subjects"), ("act", "submit: receipt"),
        ("ask", "everyone answered by the deadline?", [("act", "head: remind, fill in, or 'any time'"), ("back", "until all answered")], "no"),
        ("end", "step 3 done")]),
    ("F6", "Resolve teacher input", "HEAD or ASSIST, TEACHER comments", [
        ("start", "step 4: the system lists the problems"), ("act", "open an item: comment thread (teacher answers in 4.3)"),
        ("ask", "a BLOCKER?", [("act", "warning: change it or accept with a note"), ("back", "decision logged")], "no"),
        ("act", "assign a teacher, mark 'outside teacher', or split groups"),
        ("ask", "anything undecided?", [("back", "step 4 stays open")], "yes"),
        ("end", "every subject has a teacher; decisions logged")]),
    ("F7", "Rules, check, generate, arrange", "HEAD or ASSIST", [
        ("start", "step 5: time grid, groups, rooms, electives, rules"), ("act", "Check: pre-check report"),
        ("ask", "possible by counting?", [("bad", "reason + nearest fix"), ("back", "back to the rules")], "no"),
        ("act", "Acknowledge: Generate unlocks"), ("page", "step 6: Generate"),
        ("ask", "everything placed?", [("act", "partial timetable + tray of unplaced classes"), ("back", "drag them in")], "no"),
        ("act", "drag a class: live check on drop; 'busy elsewhere' shown grey"), ("act", "pin agreed classes, re-run around pins"),
        ("end", "every class has a time, no hard rule broken")]),
    ("F8", "Rooms and teachers", "HEAD or ASSIST", [
        ("start", "step 7: times locked"), ("act", "rooms placed automatically"), ("act", "confirm the teacher of each class"),
        ("ask", "shared room free?", [("bad", "red: booked by <department>"), ("back", "pick another room")], "no"),
        ("act", "A4 preview changes live"), ("end", "every class has a room and a teacher")]),
    ("F9", "Teacher review and changes", "HEAD or ASSIST, TEACHER", [
        ("start", "step 8: send to review"), ("page", "TEACHER 4.4 My timetable (DRAFT)"),
        ("ask", "teacher happy?", [("act", "request a change (4.5): what, why"), ("act", "head sees impact"),
                                   ("back", "approve (minimal re-run) or reject + note")], "no"),
        ("ask", "talked in person?", [("act", "direct edit + 'agreed with ___'"), ("back", "teacher told: old / new")], "yes"),
        ("end", "no open requests (or published with them visible)")]),
    ("F10", "Publish and change later", "HEAD only", [
        ("start", "step 9: Publish"),
        ("ask", "is it the head?", [("bad", "assistant: only the head publishes"), ("end", "head gets a notice")], "no"),
        ("act", "version 1 locked; every teacher notified"), ("act", "download / print per group, teacher, room"),
        ("page", "LATER 2.4.2: start a change"), ("act", "impact check + minimal change, publish version 2"),
        ("end", "only affected teachers notified")]),
    ("F11", "Approve a new format", "ADMIN", [
        ("start", "3.5: 1 unverified format"), ("act", "see the marked sample page + what it read on 3 other pages"),
        ("ask", "looks right?", [("act", "send back with a note"), ("end", "head sees it in step 1")], "no"),
        ("act", "approve: every department can use it"), ("end", "optional: export to the open-source project")]),
    ("F12", "Give the work to an assistant", "HEAD", [
        ("start", "2.3 People & rooms: invite as ASSISTANT"), ("act", "assistant joins (F2)"),
        ("act", "same Home, Profiles, workspace steps 1-8"),
        ("ask", "tries to publish?", [("bad", "only the head publishes"), ("back", "head gets a notice")], "yes"),
        ("end", "every change logged with WHO did it")]),
]

BW, BH, VG = 380, 46, 30          # main box size, vertical gap
DW, DH = 300, 74                  # decision diamond
SBW = 300                         # side box width


def wrap(s, n):
    words, lines, cur = s.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > n and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    return lines + [cur] if cur else lines


def draw(flow):
    fid, title, who, steps = flow
    out, cx, y = [], 60 + BW // 2, 110
    tx = lambda x, yy, s, sz=13.5, w="normal", c="#111827", a="middle": out.append(
        '<text x="%d" y="%d" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s">%s</text>'
        % (x, yy, sz, w, c, a, escape(s)))
    arrow = lambda x1, y1, x2, y2: out.append(
        '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#374151" stroke-width="1.6" marker-end="url(#a)"/>' % (x1, y1, x2, y2))

    def node(kind, text, x, yy, w):
        fill, stroke = KIND[kind]
        lines = wrap(text, int(w / 7.6))
        h = max(BH, 18 * len(lines) + 16)
        rx = h // 2 if kind in ("start", "end") else 8
        dash = ' stroke-dasharray="6 4"' if kind == "back" else ""
        out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" stroke="%s" stroke-width="2"%s/>'
                   % (x - w // 2, yy, w, h, rx, fill, stroke, dash))
        for i, ln in enumerate(lines):
            tx(x, yy + h / 2 - (len(lines) - 1) * 9 + 5 + i * 18, ln, 13.5, "bold" if kind in ("start", "end") else "normal")
        return h

    max_x = 60 + BW
    for i, st in enumerate(steps):
        if st[0] == "ask":
            _, q, branch, label = st
            fill, stroke = KIND["ask"]
            pts = "%d,%d %d,%d %d,%d %d,%d" % (cx, y, cx + DW // 2, y + DH // 2, cx, y + DH, cx - DW // 2, y + DH // 2)
            out.append('<polygon points="%s" fill="%s" stroke="%s" stroke-width="2"/>' % (pts, fill, stroke))
            ql = wrap(q, 28)
            for j, ln in enumerate(ql):
                tx(cx, y + DH / 2 - (len(ql) - 1) * 8 + 5 + j * 16, ln, 13)
            main_label = "no" if label == "yes" else "yes"
            # branch to the right
            bx = cx + DW // 2 + 60 + SBW // 2
            arrow(cx + DW // 2, y + DH // 2, bx - SBW // 2, y + DH // 2)
            tx(cx + DW // 2 + 30, y + DH // 2 - 8, label, 12.5, "bold", "#b45309")
            by = y + DH // 2 - BH // 2
            for k, (bk, bt) in enumerate(branch):
                h = node(bk, bt, bx, by, SBW)
                if k < len(branch) - 1:
                    arrow(bx, by + h, bx, by + h + 22)
                by += h + 22
            max_x = max(max_x, bx + SBW // 2)
            last_branch_y = by
            y += DH
            ny = max(y + VG, last_branch_y - 10)
            if i < len(steps) - 1:
                arrow(cx, y, cx, ny)                 # reaches the next box even when the side branch is tall
                tx(cx + 14, y + 19, main_label, 12.5, "bold", "#15803d", "start")
            y = ny
        else:
            h = node(st[0], st[1], cx, y, BW)
            y += h
            if i < len(steps) - 1:
                arrow(cx, y, cx, y + VG)
                y += VG
    W, H = max_x + 50, y + 70
    head = ('<text x="40" y="46" font-size="24" font-weight="bold" fill="#111827">%s  %s</text>'
            '<text x="40" y="74" font-size="14" fill="#4b5563">%s  -  details: user-flows.txt</text>'
            % (escape(fid), escape(title), escape(who)))
    legend = []
    lx = 40
    for k, lab in (("start", "start"), ("page", "page"), ("act", "action"), ("ask", "question"), ("bad", "problem"),
                   ("back", "goes back / continues"), ("end", "end")):
        f, s = KIND[k]
        legend.append('<rect x="%d" y="%d" width="18" height="14" rx="3" fill="%s" stroke="%s" stroke-width="2"/>'
                      '<text x="%d" y="%d" font-size="12" fill="#374151">%s</text>' % (lx, H - 42, f, s, lx + 24, H - 30, lab))
        lx += 34 + 7 * len(lab)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="%s">'
           '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           '<path d="M0,0 L10,5 L0,10 z" fill="#374151"/></marker></defs>'
           '<rect width="100%%" height="100%%" fill="#ffffff"/>%s%s%s</svg>'
           % (W, H, W, H, FONT, head, "".join(out), "".join(legend)))
    OUT.mkdir(exist_ok=True)
    (OUT / ("%s.svg" % fid)).write_text(svg, encoding="utf-8")
    return fid, W, H


if __name__ == "__main__":
    for f in FLOWS:
        fid, w, h = draw(f)
        print("%s %d %d" % (fid, w, h))
