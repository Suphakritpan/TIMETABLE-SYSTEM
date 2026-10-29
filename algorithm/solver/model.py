"""PROBLEM -> ACTIVITIES: what has to be placed, built from the reader's plan rows and the head's settings.

A problem (a plain dict, JSON-friendly) for ONE term of ONE profile:
  days, hours                      the time grid (hours without the lunch break; a jump between two hours, e.g.
                                   11:00 -> 13:00, is a break that no block may run across)
  rules                            no_gaps, start_first_hour, spread_days, spread_slack, max_hours_daily,
                                   lecture_for (year | group), late_periods, quality_weights  (config/defaults.json)
  rooms                            [{name, type, seats}]  - any room types the institution has
  room_types (optional)            {"L": type, "P": type}: what a lecture / lab block needs (default lecture / lab)
  room_needs (optional)            {"<year plan id>:<code>" or "<code>": {"L": type, "P": type}} - a subject that
                                   needs another room (a computer lab, a studio...)
  year_plans                       [{id: "B.Ed.-Y1", groups: [{name, students}], rows: [reader rows of this term]}]
  electives                        {"<year plan id>:<order>": {mode: schedule | reserve, code, lecture, lab, taught_by}}
  pins                             {activity key: [day, hour, room or ""]}
  lunch      (optional)            {"window": ["11:00", "12:00"]}: every group gets ONE free hour a day inside the
                                   window (a block of kind B, no room, that may only start there); the hours of the
                                   window are ordinary hours otherwise (a class may use the one lunch does not)
  off_site   (optional)            ["<year plan id>:<code>" or "<code>"] - the head said: not placed (e.g. year 5 teaching
                                   practice 6(0-18-6) = full-time at a school, written like a course)
  teaching   (optional)            {"<year plan id>:<code>" or "<code>": [teacher ids]}  - decided in step 4
  teachers   (optional)            {teacher id: {"busy": [[day, hour], ...], "max_hours_day": n}} - from the
                                   availability round; a teacher who gave NO availability is simply not limited
                                   (user, 2026-10-25); max_hours_day missing = no daily limit
  group_busy (optional)            {group name: [[day, hour], ...]} - times a student group is away (ระบบทวิภาคี:
                                   fixed days at a company); no class covering the group may touch them

Activities (spec + old project, unchanged rules):
  a lecture block is taken by the whole year together (lecture_for "group": by each group); a lab block by each group
  a course 3(2-2-5) -> lecture 2 h (whole year, lecture room) + lab 2 h (each group, lab room)
  an elective slot needs the head's decision: SCHEDULE a course (like a course; taught by another faculty =
  one whole-year block without a room) or RESERVE (the hours stay empty for the year, no room) - no "skip"
  field-work rows (1(240 hours)) are not placed; rows with hours x-x-x need the head to set the hours
  an ACTIVITY row (vocational กิจกรรมเสริมหลักสูตร, 0-2-0) is one block for the whole year, with no room
"""


def activities(problem):
    """Returns (activities, issues). An issue is something the head must decide before scheduling."""
    acts, issues = [], []
    choices = problem.get("electives", {})
    off = set(problem.get("off_site", []))
    day = longest(problem)
    for yp in problem["year_plans"]:
        whole = sum(g["students"] for g in yp["groups"])
        for r in yp["rows"]:
            where = "%s, %s %s" % (yp["id"], r["code"], r.get("name_th", "")[:40])
            if r.get("field_hours") or r["code"] in off or "%s:%s" % (yp["id"], r["code"]) in off:
                continue                                        # off-site field work / the head said off-site
            if r["kind"] == "course" and max(r.get("lecture") or 0, r.get("lab") or 0) > day:
                issues.append("%d hours a week cannot be one block between breaks (longest stretch %d hours) - "
                              "off-site practice? mark it off-site, or split it: %s"
                              % (max(r["lecture"] or 0, r["lab"] or 0), day, where))
                continue
            if r["kind"] == "slot":
                c = choices.get("%s:%s" % (yp["id"], r["order"]))
                if not c:
                    issues.append("elective slot needs a decision (Schedule or Reserve): " + where)
                    continue
                if c["mode"] == "reserve":
                    hours = (r.get("lecture") or 0) + (r.get("lab") or 0)
                    if not hours:
                        issues.append("reserved slot has no hours (x-x-x): set them - " + where)
                        continue
                    acts.append(act(yp, r, "R", hours, yp["id"], whole, None, code=r["code"]))
                    continue
                lec, lab, code = c.get("lecture"), c.get("lab"), c["code"]
                if lec is None or lab is None:
                    issues.append("the chosen elective %s has no hours: set them - %s" % (code, where))
                    continue
                if c.get("taught_by") == "other":               # another faculty teaches it: time only, no room
                    acts.append(act(yp, r, "E", lec + lab, yp["id"], whole, None, code=code))
                    continue
                add_course(problem, acts, yp, r, lec, lab, code)
                continue
            if r["kind"] == "activity":                         # กิจกรรมเสริมหลักสูตร: the year together, no room, no credit
                hours = (r.get("lecture") or 0) + (r.get("lab") or 0)
                if not hours:
                    issues.append("activity has no hours: set them - " + where)
                    continue
                acts.append(act(yp, r, "A", hours, yp["id"], whole, None, code=r["code"]))
                continue
            if r.get("lecture") is None or r.get("lab") is None:
                issues.append("hours not set (x-x-x): set them before scheduling - " + where)
                continue
            add_course(problem, acts, yp, r, r["lecture"], r["lab"], r["code"])
    window = [h for h in (problem.get("lunch") or {}).get("window", []) if h in problem["hours"]]
    if window:
        for yp in problem["year_plans"]:
            for g in yp["groups"]:
                for d in problem["days"]:
                    acts.append({"key": "lunch:%s:%s" % (g["name"], d), "year_plan": yp["id"], "students_set": g["name"],
                                 "code": "LUNCH", "name_th": "พักกลางวัน", "kind": "B", "hours": 1, "room_type": None,
                                 "students": g["students"], "teachers": [], "allowed": [[d, h] for h in window]})
    for i, a in enumerate(acts, 1):
        a["id"] = i
    return assign_teachers(problem, acts), issues


def add_course(problem, acts, yp, r, lec, lab, code):
    groups, whole = yp["groups"], sum(g["students"] for g in yp["groups"])
    needs = {"L": "lecture", "P": "lab", **problem.get("room_types", {})}
    own = problem.get("room_needs", {})
    needs.update(own.get(code, {}), **own.get("%s:%s" % (yp["id"], code), {}))
    if lec:
        if problem.get("rules", {}).get("lecture_for", "year") == "group":
            for g in groups:
                acts.append(act(yp, r, "L", lec, g["name"], g["students"], needs["L"], code=code))
        else:
            acts.append(act(yp, r, "L", lec, yp["id"], whole, needs["L"], code=code))
    if lab:
        for g in groups:
            acts.append(act(yp, r, "P", lab, g["name"], g["students"], needs["P"], code=code))


def act(yp, r, kind, hours, students_set, students, room_type, code):
    return {"key": "%s:%s:%s:%s" % (students_set, code, kind, r["order"]), "year_plan": yp["id"],
            "students_set": students_set, "code": code, "name_th": r.get("name_th", ""), "kind": kind,
            "hours": hours, "room_type": room_type, "students": students, "teachers": []}


def assign_teachers(problem, acts):
    """Who teaches each class (step 4 decided it): by "<year plan>:<code>" first, then by code alone.
    Reserved hours (R) have no teacher; a class with no teacher yet is simply not limited."""
    teaching = problem.get("teaching", {})
    for a in acts:
        if a["kind"] != "R":
            a["teachers"] = list(teaching.get("%s:%s" % (a["year_plan"], a["code"]), teaching.get(a["code"], [])))
    return acts


def sessions(problem):
    """The day's unbroken stretches as (first index, length): 08-11 + 13-18 -> [(0, 4), (4, 6)].
    A break = the next period starts later than the usual period length (lunch is simply left out of "hours");
    the usual length is the most common step, so 50-minute periods work as well as 60-minute ones.
    Periods that are not clock times ("1", "2"...) have no breaks."""
    try:
        mins = [int(h.split(":")[0]) * 60 + int(h.split(":")[1]) for h in problem["hours"]]
    except (ValueError, IndexError):
        return [(0, len(problem["hours"]))]
    steps = [b - a for a, b in zip(mins, mins[1:])]
    usual = max(set(steps), key=steps.count) if steps else 0
    out, start = [], 0
    for i in range(1, len(mins) + 1):
        if i == len(mins) or mins[i] - mins[i - 1] > usual:
            out.append((start, i - start))
            start = i
    return out


def starts(problem, length):
    """Hour indices where a block of this length can start without running across a break - and, with a movable
    lunch hour, without covering the WHOLE lunch window (the group would have no hour left to eat: measured on
    Chonburi, 28 groups, long practice blocks did that and FET got stuck at 574 of 761 classes)."""
    window = [problem["hours"].index(h) for h in (problem.get("lunch") or {}).get("window", []) if h in problem["hours"]]
    out = [s + i for s, n in sessions(problem) for i in range(n - length + 1)]
    if window:
        out = [i for i in out if not (i <= min(window) and i + length - 1 >= max(window))]
    return out


def longest(problem):
    """The longest block that fits in a day (between breaks, leaving a lunch hour): longer = off-site practice."""
    return max((n for n in range(1, len(problem["hours"]) + 1) if starts(problem, n)), default=1)


def leaves(problem, students_set):
    """The groups a students set covers: a year plan id = all its groups; a group = itself."""
    for yp in problem["year_plans"]:
        if students_set == yp["id"]:
            return [g["name"] for g in yp["groups"]]
    return [students_set]


def daily_limits(problem, acts):
    """{group: max hours a day}: max_hours_daily, and with spread_days the week's hours spread evenly over the
    days (+ spread_slack) - never below the group's longest block (old project rule, kept), and never so low that
    the group's blocks cannot fit into the days at all (six 3-hour blocks in 5 days need 6 hours on one day, not
    the even 18 / 5 + 1 = 5: measured on a Chula plan). The head's own max_hours_daily is not raised: the
    pre-check explains it instead."""
    rules = problem.get("rules", {})
    days, longest_day = len(problem["days"]), len(problem["hours"])
    limits = {}
    for yp in problem["year_plans"]:
        for g in yp["groups"]:
            mine = [a["hours"] for a in acts if g["name"] in leaves(problem, a["students_set"])]
            cap = rules.get("max_hours_daily", longest_day)
            limit = cap
            if rules.get("spread_days") and mine:
                # spread over the days the group is actually there (ระบบทวิภาคี: some days at a company)
                gone = {(d, h) for d, h in problem.get("group_busy", {}).get(g["name"], [])}
                free = sum(1 for d in problem["days"] if any((d, h) not in gone for h in problem["hours"])) or days
                even = max(-(-sum(mine) // free) + rules.get("spread_slack", 1), max(mine))
                while even < cap and not packs(mine, free, even):
                    even += 1
                limit = min(cap, even)
            limits[g["name"]] = max(limit, max(mine, default=1))
    return limits


def packs(blocks, days, limit):
    """Can these blocks go into this many days with at most `limit` hours a day? (an exact search; a group has
    few blocks, and days with the same load are tried once)"""
    blocks, load = sorted(blocks, reverse=True), [0] * days
    if sum(blocks) > days * limit or (blocks and blocks[0] > limit):
        return False

    def place(i):
        if i == len(blocks):
            return True
        tried = set()
        for d in range(days):
            if load[d] + blocks[i] <= limit and load[d] not in tried:
                tried.add(load[d])
                load[d] += blocks[i]
                if place(i + 1):
                    return True
                load[d] -= blocks[i]
        return False
    return place(0)
