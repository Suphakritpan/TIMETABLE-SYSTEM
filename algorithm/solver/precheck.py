"""PRE-CHECK: impossible by counting? Explain it BEFORE running the scheduler (spec: never a bare "failed").
FET itself refuses impossible data with "Cannot precompute - data is wrong" and NO timetable at all, so every
case it would refuse has to be caught here, with a reason and the nearest fix, in plain words.
"""
from .model import daily_limits, leaves, packs, sessions, starts
from .model import longest as longest_block


def precheck(problem, acts, issues):
    problems = [{"what": i, "fix": "decide it in the rules step"} for i in issues]
    days, hours = problem["days"], problem["hours"]
    limits = daily_limits(problem, acts)
    tight = 0.0
    # 1 every group: hours needed vs hours it can have (minus the times it is away: ระบบทวิภาคี)
    gone = {g: {(d, h) for d, h in v} for g, v in problem.get("group_busy", {}).items()}
    for yp in problem["year_plans"]:
        for g in yp["groups"]:
            need = sum(a["hours"] for a in acts if g["name"] in leaves(problem, a["students_set"]))
            g_away = gone.get(g["name"], set())
            have = sum(min(sum(1 for h in hours if (d, h) not in g_away), limits[g["name"]]) for d in days)
            tight = max(tight, need / have if have else 9)
            if need > have:
                problems.append({"what": "%s needs %d hours a week, it can have %d" % (g["name"], need, have),
                                 "fix": "add %d hour slots, or allow more hours a day" % (need - have)})
            elif not packs([a["hours"] for a in acts if g["name"] in leaves(problem, a["students_set"])],
                           sum(1 for d in days if any((d, h) not in g_away for h in hours)),
                           min(len(hours), limits[g["name"]])):
                problems.append({"what": "%s: its blocks do not fit into %d days of at most %d hours (the hours add up, "
                                         "the block sizes do not)" % (g["name"], len(days), limits[g["name"]]),
                                 "fix": "allow more hours a day, or split a block"})
    # 2 every room type: hours needed vs rooms x slots
    slots = len(days) * len(hours)
    for rtype in sorted({a["room_type"] for a in acts if a["room_type"]}):
        need = sum(a["hours"] for a in acts if a["room_type"] == rtype)
        rooms = [r for r in problem["rooms"] if r["type"] == rtype]
        have = len(rooms) * slots
        if need and not rooms:
            problems.append({"what": "%d hours need a %s room, there are none" % (need, rtype),
                             "fix": "add a %s room" % rtype})
            continue
        if need:
            tight = max(tight, need / have)
            if need > have:
                extra = -(-(need - have) // slots)
                problems.append({"what": "%s rooms: %d hours needed, %d available" % (rtype, need, have),
                                 "fix": "add %d %s room(s)" % (extra, rtype)})
        # 3 seats: the biggest class of this type must fit somewhere
        big = max((a["students"] for a in acts if a["room_type"] == rtype), default=0)
        seats = max((r["seats"] for r in rooms), default=0)
        if big > seats and rooms:
            problems.append({"what": "a %s class has %d students, the biggest %s room seats %d" % (rtype, big, rtype, seats),
                             "fix": "add a bigger %s room, or split the group" % rtype})
    # 4 every teacher: hours to teach vs the hours they are free (no availability given = free all week)
    slots_week = len(days) * len(hours)
    for t in sorted({t for a in acts for t in a["teachers"]}):
        need = sum(a["hours"] for a in acts if t in a["teachers"])
        busy = {(d, h) for d, h in problem.get("teachers", {}).get(t, {}).get("busy", []) if d in days and h in hours}
        free = slots_week - len(busy)
        if need > free:
            problems.append({"what": "teacher %s must teach %d hours but is free only %d hours a week" % (t, need, free),
                             "fix": "give some classes to another teacher, or ask %s to free more time" % t})
    # 4a every teacher with a most-hours-a-day: the week's hours fit (each day: free hours, at most the limit), no
    #    block is longer than the limit, and the blocks pack into the free days (sizes, not only the sum)
    for t in sorted({t for a in acts for t in a["teachers"]}):
        most = problem.get("teachers", {}).get(t, {}).get("max_hours_day")
        if not most:
            continue
        mine = [a["hours"] for a in acts if t in a["teachers"]]
        busy = {(d, h) for d, h in problem.get("teachers", {}).get(t, {}).get("busy", [])}
        free_days = [d for d in days if any((d, h) not in busy for h in hours)]
        can = sum(min(most, sum(1 for h in hours if (d, h) not in busy)) for d in days)
        if max(mine) > most:
            problems.append({"what": "teacher %s may teach at most %d hours a day, but has a %d-hour block"
                                     % (t, most, max(mine)),
                             "fix": "ask %s to allow %d hours a day, give the block to another teacher, or split it"
                                    % (t, max(mine))})
        elif sum(mine) > can:
            problems.append({"what": "teacher %s must teach %d hours, but at most %d a day fits only %d in the week"
                                     % (t, sum(mine), most, can),
                             "fix": "ask %s to allow more hours a day, or give some classes to another teacher" % t})
        elif not packs(mine, len(free_days), most):
            problems.append({"what": "teacher %s: the blocks do not fit into %d days of at most %d hours (the hours add "
                                     "up, the block sizes do not)" % (t, len(free_days), most),
                             "fix": "ask %s to allow more hours a day, or give a block to another teacher" % t})
    # 4b every block with teachers: somewhere in the week its teachers are all free for the whole block
    #    (measured: FET refuses with "data is wrong" and no timetable at all when one has no such place)
    away = {t: {(d, h) for d, h in v.get("busy", [])} for t, v in problem.get("teachers", {}).items()}
    for a in acts:
        if not any(away.get(t) for t in a["teachers"]):
            continue
        fits = any(all((d, hours[i]) not in away.get(t, ()) for t in a["teachers"] for i in range(s0, s0 + a["hours"]))
                   for d in days for s0 in starts(problem, a["hours"]))
        if not fits:
            problems.append({"what": "%s (%d hours in a row): %s never free that long at the same time"
                                     % (a["key"], a["hours"], " and ".join(a["teachers"])),
                             "fix": "ask for a free stretch of %d hours, give it to another teacher, or split the block"
                                    % a["hours"]})
    # 4c every teacher: the hours of their blocks of k+ hours vs the free hours that lie in a free stretch of k+
    #    hours (a lone free hour cannot hold a 3-hour block). Measured: FET HANGS on this, past its time limit
    for t in sorted({t for a in acts for t in a["teachers"]}):
        if not away.get(t):
            continue
        mine = [a["hours"] for a in acts if t in a["teachers"]]
        for k in sorted(set(mine)):
            need = sum(h for h in mine if h >= k)
            usable = set()
            for d in days:
                for s0 in starts(problem, k):
                    run = [(d, hours[i]) for i in range(s0, s0 + k)]
                    if not any(x in away[t] for x in run):
                        usable.update(run)
            if need > len(usable):
                problems.append({"what": "teacher %s has %d hours of %d-hour (or longer) blocks, but only %d free hours "
                                         "lie in a free stretch that long" % (t, need, k, len(usable)),
                                 "fix": "ask %s for longer free stretches, or give a block to another teacher" % t})
                break
    # 4d every block of a group that is away some of the time: somewhere it fits in the group's free time
    #    (FET refuses or hangs on a block with no possible place - say which one, and why)
    for a in acts:
        groups = [g for g in leaves(problem, a["students_set"]) if gone.get(g)]
        if not groups:
            continue
        fits = any(all((d, hours[i]) not in gone.get(g, ()) for g in groups for i in range(s0, s0 + a["hours"]))
                   for d in days for s0 in starts(problem, a["hours"]))
        if not fits:
            problems.append({"what": "%s (%d hours in a row) has no free stretch: %s away too much of the week"
                                     % (a["key"], a["hours"], " and ".join(groups)),
                             "fix": "free some of %s's days, or split the block" % " / ".join(groups)})
    # 5 a block that only fits after a break + "start at the first hour": that day = the hours before it + the block
    #   (measured: FET hangs on this instead of refusing it - 6-hour lab, morning 08-11, limit 6 a day)
    rules = problem.get("rules", {})
    if rules.get("start_first_hour"):
        for g, limit in limits.items():
            for a in acts:
                first = min(starts(problem, a["hours"]), default=0)
                if g in leaves(problem, a["students_set"]) and first > 0:
                    day = (first if rules.get("no_gaps") else 1) + a["hours"]
                    if day > limit:
                        problems.append({"what": "%s: the %d-hour block %s only fits after a break, and 'start at the "
                                                 "first hour' makes that day %d hours (max %d)" % (g, a["hours"], a["code"], day, limit),
                                         "fix": "allow days that start after lunch, raise the daily limit, or split the block"})
                        break
    # 6 a block longer than a day
    longest = max((a["hours"] for a in acts), default=0)
    stretch = longest_block(problem)
    if longest > stretch:
        problems.append({"what": "a %d-hour block is longer than the longest stretch between breaks (%d hours)"
                                 % (longest, stretch),
                         "fix": "split the block or add hours"})
    return {"possible": not problems, "problems": problems, "tightness": round(tight, 3)}
