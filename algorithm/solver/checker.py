"""OUR OWN CHECK of every result - the scheduler is never trusted (spec). The SAME function answers the live check
on every drag in the arrange page later, so the browser never has its own copy of the rules.
Returns a list of breaks in plain words; empty = no hard rule broken.
"""
from .model import daily_limits, leaves, starts


def check(problem, acts, placements):
    hours, days = problem["hours"], problem["days"]
    hidx = {h: i for i, h in enumerate(hours)}
    rooms = {r["name"]: r for r in problem["rooms"]}
    limits = daily_limits(problem, acts)
    breaks, busy, room_busy, daily, teaching, t_daily = [], {}, {}, {}, {}, {}
    away = {(t, d, h) for t, v in problem.get("teachers", {}).items() for d, h in v.get("busy", [])}
    gone = {(g, d, h) for g, v in problem.get("group_busy", {}).items() for d, h in v}
    for a in acts:
        p = placements.get(a["id"])
        if not p:
            continue                                     # unplaced classes are the tray, not a break
        day, hour, room = p
        if day not in days or hour not in hidx:
            breaks.append("%s is placed at a time that does not exist (%s %s)" % (a["key"], day, hour))
            continue
        start = hidx[hour]
        if a.get("allowed") and [day, hour] not in [list(x) for x in a["allowed"]]:
            breaks.append("%s may only be at %s" % (a["key"], ", ".join(sorted({h for _, h in a["allowed"]}))))
        if start + a["hours"] > len(hours):
            breaks.append("%s runs past the end of the day" % a["key"])
        elif start not in starts(problem, a["hours"]):
            breaks.append("%s runs across a break (lunch) on %s" % (a["key"], day))
        for i in range(start, min(start + a["hours"], len(hours))):
            slot = (day, hours[i])
            for g in leaves(problem, a["students_set"]):
                if (g, day, hours[i]) in gone:
                    breaks.append("group %s is away (busy) on %s %s, but %s is there" % (g, day, hours[i], a["key"]))
                if (g, slot) in busy:
                    breaks.append("group %s has two classes on %s %s (%s and %s)" % (g, day, hours[i], busy[(g, slot)], a["key"]))
                busy[(g, slot)] = a["key"]
            for t in a.get("teachers", []):
                if (t, slot) in teaching:
                    breaks.append("teacher %s has two classes on %s %s (%s and %s)" % (t, day, hours[i], teaching[(t, slot)], a["key"]))
                teaching[(t, slot)] = a["key"]
                if (t, day, hours[i]) in away:
                    breaks.append("teacher %s said they are busy on %s %s, but %s is there" % (t, day, hours[i], a["key"]))
            if room:
                if (room, slot) in room_busy:
                    breaks.append("room %s is double-booked on %s %s" % (room, day, hours[i]))
                room_busy[(room, slot)] = a["key"]
        for g in leaves(problem, a["students_set"]):
            daily[(g, day)] = daily.get((g, day), 0) + a["hours"]
        for t in a.get("teachers", []):
            t_daily[(t, day)] = t_daily.get((t, day), 0) + a["hours"]
        if a["room_type"]:
            if not room:
                breaks.append("%s needs a %s room and has none" % (a["key"], a["room_type"]))
            elif room in rooms:
                if rooms[room]["type"] != a["room_type"]:
                    breaks.append("%s is a %s class in a %s room (%s)" % (a["key"], a["room_type"], rooms[room]["type"], room))
                if rooms[room]["seats"] < a["students"]:
                    breaks.append("%s: room %s seats %d, the class has %d" % (a["key"], room, rooms[room]["seats"], a["students"]))
    for (g, day), h in daily.items():
        if h > limits.get(g, 99):
            breaks.append("group %s has %d hours on %s (max %d)" % (g, h, day, limits[g]))
    for (t, day), h in t_daily.items():
        most = problem.get("teachers", {}).get(t, {}).get("max_hours_day")
        if most and h > most:
            breaks.append("teacher %s has %d hours on %s (max %d)" % (t, h, day, most))
    return breaks
