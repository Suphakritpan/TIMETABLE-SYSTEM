"""FET: write its input file, run fet-cl (fixed seeds, a time limit + our own hard timeout), read its answer.
FET 6.8.5 (AGPL) is used unchanged as a separate program. Measured: it solves every CED term in < 0.1 s;
when time runs out it writes <name>-highest/ = the best PARTIAL result (placed classes; the rest = the tray).
"""
import shutil
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

from .model import daily_limits, starts

OUTPUT_OFF = ["--htmllevel=0", "--writetimetableconflicts=false"] + ["--writetimetables%s=false" % n for n in (
    "statistics", "dayshorizontal", "daysvertical", "timehorizontal", "timevertical",
    "subgroups", "groups", "years", "teachers", "teachersfreeperiods", "rooms", "subjects")]


def el(tag, value):
    return "\t<%s>%s</%s>" % (tag, escape(str(value)), tag)


def constraint(tag, *lines):
    return "\n".join(["<%s>" % tag, el("Weight_Percentage", 100)] + list(lines) + [el("Active", "true"), "</%s>" % tag])


def write(problem, acts, name="term"):
    days, hours, rules, rooms = problem["days"], problem["hours"], problem.get("rules", {}), problem["rooms"]
    x = ['<?xml version="1.0" encoding="UTF-8"?>', '<fet version="6.0.0">', "<Mode>Official</Mode>",
         el("Institution_Name", name).strip()]
    x += ["<Days_List>", el("Number_of_Days", len(days))] + ["<Day>\n%s\n</Day>" % el("Name", d) for d in days] + ["</Days_List>"]
    x += ["<Hours_List>", el("Number_of_Hours", len(hours))] + ["<Hour>\n%s\n</Hour>" % el("Name", h) for h in hours] + ["</Hours_List>"]
    x += ["<Subjects_List>"] + ["<Subject>\n%s\n</Subject>" % el("Name", c) for c in sorted({a["code"] for a in acts})] + ["</Subjects_List>"]
    x += ["<Activity_Tags_List>"] + ["<Activity_Tag>\n%s\n%s\n</Activity_Tag>" % (el("Name", t), el("Printable", "true"))
                                     for t in sorted({a["room_type"] for a in acts if a["room_type"]})] + ["</Activity_Tags_List>"]
    teachers = sorted({t for a in acts for t in a["teachers"]})
    x += ["<Teachers_List>"] + ["<Teacher>\n%s\n</Teacher>" % el("Name", t) for t in teachers] + ["</Teachers_List>"]
    x.append("<Students_List>")
    for yp in problem["year_plans"]:
        x += ["<Year>", el("Name", yp["id"]), el("Number_of_Students", sum(g["students"] for g in yp["groups"])),
              el("Number_of_Categories", 0), el("Separator", " ")]
        # one group named like its year (1 plan = 1 group, the vocational case): the year IS the group; FET refuses a
        # group with its year's name ("already added as another year")
        x += ["\t<Group>\n\t%s\n\t%s\n\t</Group>" % (el("Name", g["name"]), el("Number_of_Students", g["students"]))
              for g in yp["groups"] if g["name"] != yp["id"]]
        x.append("</Year>")
    x.append("</Students_List>")
    x.append("<Activities_List>")
    for a in acts:
        tag = [el("Activity_Tag", a["room_type"])] if a["room_type"] else []
        x += ["<Activity>"] + [el("Teacher", t) for t in a["teachers"]] + [el("Subject", a["code"])] + tag + [
            el("Students", a["students_set"]), el("Duration", a["hours"]), el("Total_Duration", a["hours"]),
            el("Id", a["id"]), el("Activity_Group_Id", 0), el("Active", "true"), el("Comments", a["key"]), "</Activity>"]
    x.append("</Activities_List>")
    x.append("<Buildings_List>\n</Buildings_List>")
    x.append("<Rooms_List>")
    for r in rooms:
        x += ["<Room>", el("Name", r["name"]), el("Building", ""), el("Capacity", r["seats"]), el("Virtual", "false"), "</Room>"]
    x.append("</Rooms_List>")
    x.append("<Time_Constraints_List>")
    x.append(constraint("ConstraintBasicCompulsoryTime"))
    if rules.get("no_gaps"):
        x.append(constraint("ConstraintStudentsMaxGapsPerWeek", el("Max_Gaps", 0)))
    if rules.get("start_first_hour"):
        x.append(constraint("ConstraintStudentsEarlyMaxBeginningsAtSecondHour", el("Max_Beginnings_At_Second_Hour", 0)))
    for group, limit in daily_limits(problem, acts).items():
        if limit < len(hours):
            x.append(constraint("ConstraintStudentsSetMaxHoursDaily", el("Maximum_Hours_Daily", limit), el("Students", group)))
    # teachers' busy times (the availability round; a teacher who gave none is not limited)
    for t in teachers:
        busy = [(d, h) for d, h in problem.get("teachers", {}).get(t, {}).get("busy", []) if d in days and h in hours]
        if busy:
            x.append(constraint("ConstraintTeacherNotAvailableTimes", el("Teacher", t),
                                el("Number_of_Not_Available_Times", len(busy)),
                                *["\t<Not_Available_Time>\n\t%s\n\t%s\n\t</Not_Available_Time>" % (el("Day", d), el("Hour", h))
                                  for d, h in busy]))
    # teachers' most hours a day (the availability round; checked: FET 6.8.5 takes Teacher_Name here, not Teacher)
    for t in teachers:
        most = problem.get("teachers", {}).get(t, {}).get("max_hours_day")
        if most and most < len(hours):
            x.append(constraint("ConstraintTeacherMaxHoursDaily", el("Teacher_Name", t), el("Maximum_Hours_Daily", most)))
    # student groups away (ระบบทวิภาคี: days at a company)
    for g, slots in sorted(problem.get("group_busy", {}).items()):
        busy = [(d, h) for d, h in slots if d in days and h in hours]
        if busy:
            x.append(constraint("ConstraintStudentsSetNotAvailableTimes", el("Students", g),
                                el("Number_of_Not_Available_Times", len(busy)),
                                *["\t<Not_Available_Time>\n\t%s\n\t%s\n\t</Not_Available_Time>" % (el("Day", d), el("Hour", h))
                                  for d, h in busy]))
    # no block runs across a break (lunch): each block may only start where it fits in one stretch
    for a in acts:
        if a.get("allowed"):                 # a block that may only start at these times (the movable lunch hour)
            x.append(constraint("ConstraintActivityPreferredStartingTimes", el("Activity_Id", a["id"]),
                                el("Number_of_Preferred_Starting_Times", len(a["allowed"])),
                                *["\t<Preferred_Starting_Time>\n\t%s\n\t%s\n\t</Preferred_Starting_Time>"
                                  % (el("Preferred_Starting_Day", d), el("Preferred_Starting_Hour", h))
                                  for d, h in a["allowed"]]))
            continue
        ok = starts(problem, a["hours"])
        if len(ok) < len(hours) - a["hours"] + 1:
            x.append(constraint("ConstraintActivityPreferredStartingTimes", el("Activity_Id", a["id"]),
                                el("Number_of_Preferred_Starting_Times", len(days) * len(ok)),
                                *["\t<Preferred_Starting_Time>\n\t%s\n\t%s\n\t</Preferred_Starting_Time>"
                                  % (el("Preferred_Starting_Day", d), el("Preferred_Starting_Hour", hours[i]))
                                  for d in days for i in ok]))
    by_key = {a["key"]: a for a in acts}
    pins = {k: v for k, v in problem.get("pins", {}).items() if k in by_key and v[0] in days and v[1] in hours}
    for k, (day, hour, room) in pins.items():
        x.append(constraint("ConstraintActivityPreferredStartingTime", el("Activity_Id", by_key[k]["id"]),
                            el("Preferred_Day", day), el("Preferred_Hour", hour), el("Permanently_Locked", "true")))
    x.append("</Time_Constraints_List>")
    x.append("<Space_Constraints_List>")
    x.append(constraint("ConstraintBasicCompulsorySpace"))
    for tag in sorted({a["room_type"] for a in acts if a["room_type"]}):
        names = [r["name"] for r in rooms if r["type"] == tag]
        if names:
            x.append(constraint("ConstraintActivityTagPreferredRooms", el("Activity_Tag", tag),
                                el("Number_of_Preferred_Rooms", len(names)), *[el("Preferred_Room", n) for n in names]))
    room_names = {r["name"] for r in rooms}
    for k, (day, hour, room) in pins.items():
        if room in room_names:
            x.append(constraint("ConstraintActivityPreferredRoom", el("Activity_Id", by_key[k]["id"]), el("Room", room),
                                el("Permanently_Locked", "true")))
    x.append("</Space_Constraints_List>")
    x.append("</fet>")
    return "\n".join(x) + "\n"


def version(fet="fet-cl"):
    """The scheduler's own version string (kept with every run)."""
    try:
        out = subprocess.run([shutil.which(fet) or fet, "--version"], capture_output=True, text=True, timeout=10)
        return (out.stdout + out.stderr).strip().splitlines()[0][:80] or "unknown"
    except (OSError, subprocess.TimeoutExpired, IndexError):
        return "unknown"


def seeds(k):
    return ["--randomseeds10=%d" % k, "--randomseeds11=%d" % (k * 7 + 1), "--randomseeds12=%d" % (k * 13 + 2),
            "--randomseeds20=%d" % k, "--randomseeds21=%d" % (k * 11 + 3), "--randomseeds22=%d" % (k * 17 + 5)]


def run(fet_text, seed=1, time_limit=10, fet="fet-cl", cancelled=lambda: False):
    """Returns {status: solved | partial | failed | hang | cancelled, placements: {activity id: (day, hour, room)},
    message}. cancelled(): asked every 0.1 s; True = the person pressed cancel: FET is stopped at once."""
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "term.fet", Path(tmp) / "out"
        src.write_text(fet_text, encoding="utf-8")
        cmd = [shutil.which(fet) or fet, "--inputfile=%s" % src, "--outputdir=%s" % out,
               "--timelimitseconds=%d" % time_limit, "--language=en_US"] + OUTPUT_OFF + seeds(seed)
        try:
            logf = open(Path(tmp) / "log.txt", "w+")          # a file, not a pipe: a full pipe would stall FET
            p = subprocess.Popen(cmd, stdout=logf, stderr=subprocess.STDOUT, text=True)
            end = time.monotonic() + time_limit + 10                                # our own hard stop
            while p.poll() is None:
                if cancelled():
                    p.kill()
                    p.wait()
                    return {"status": "cancelled", "placements": {}, "message": "cancelled"}
                if time.monotonic() > end:
                    p.kill()
                    p.wait()
                    raise subprocess.TimeoutExpired(cmd, time_limit + 10)
                time.sleep(0.1)
            logf.seek(0)
            log = logf.read().strip()
            logf.close()
        except subprocess.TimeoutExpired:
            return {"status": "hang", "placements": {},
                    "message": "the scheduler got stuck and was stopped - usually classes that need the same few hours "
                               "(pinned classes, teachers' free times, a long block and the start-time rule)"}
        full = out / "timetables" / "term" / "term_activities.xml"
        best = out / "timetables" / "term-highest" / "term_activities.xml"     # checked: FET 6.8.5 names it so
        if full.exists() and "successful" in log.lower():
            return {"status": "solved", "placements": parse(full), "message": ""}
        if best.exists():
            return {"status": "partial", "placements": parse(best),
                    "message": "time ran out; this is the best partial result", "difficult": difficult(out)}
        if "data is wrong" in log.lower() or "cannot precompute" in log.lower():
            return {"status": "failed", "placements": {}, "message": "the scheduler refused the data: " + log[-300:]}
        return {"status": "failed", "placements": {}, "message": log[-300:] or "no output"}


def parse(xml):
    out = {}
    for a in ET.parse(xml).getroot().iter("Activity"):
        if a.findtext("Day"):
            out[int(a.findtext("Id"))] = (a.findtext("Day"), a.findtext("Hour"), a.findtext("Room") or "")
    return out


def difficult(out):
    f = out / "logs" / "difficult_activities.txt"
    return f.read_text(encoding="utf-8", errors="replace")[-2000:] if f.exists() else ""
