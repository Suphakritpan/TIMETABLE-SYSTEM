"""Part 2 (schedule) through the API: part 1's rows -> a term -> live events -> 0 hard-rule breaks -> every class
graded; a hand move changes only that class and pins it; the next schedule keeps it; teacher names give each
teacher their week, a clash is found, and the next schedule keeps that teacher apart; the movable lunch hour.
Needs the Docker image (FET) and the samples folder. Run: python3 -m unittest tests.test_schedule"""
import os
import time
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from app.server import app
except ImportError:
    TestClient = None

HERE = Path(os.environ.get("DEMO_SAMPLES", "/samples"))


@unittest.skipUnless(TestClient and (HERE / "university/CED KMUTNB ค.อ.บ. (text).pdf").exists(), "needs the image + samples")
class TestSchedule(unittest.TestCase):
    c = TestClient(app) if TestClient else None

    @classmethod
    def ingest(cls, sample):
        jid = cls.c.post("/api/read/sample/" + sample).json()["id"]
        while cls.c.get("/api/jobs/" + jid).json()["status"] in ("queued", "running"):
            time.sleep(0.3)
        return jid

    @classmethod
    def setUpClass(cls):
        cls.ced = cls.ingest("ced")

    def run_term(self, sid, **settings):
        st = self.c.get("/api/sched/" + sid).json()["settings"]
        self.assertEqual(self.c.post("/api/sched/%s/run" % sid, json={**st, **settings}).status_code, 200)
        while True:
            e = self.c.get("/api/sched/%s/events" % sid).json()
            if e["status"] != "running":
                return e
            time.sleep(0.1)

    def test_term_move_pin_teachers_lunch(self):
        sid = self.c.post("/api/sched/from-ingest/" + self.ced).json()["id"]
        e = self.run_term(sid, term=1, groups=2)
        self.assertEqual(e["status"], "solved", e)
        done = [x["name"] for x in e["events"] if x["event"] == "stage" and x["state"] == "done"]
        self.assertEqual(done, ["build", "precheck", "solve", "check", "score"])
        self.assertEqual(sum(1 for x in e["events"] if x["event"] == "candidate" and x["state"] == "done"), 5)
        v = e["view"]
        self.assertEqual(v["summary"]["hard_breaks"], 0)
        self.assertEqual(v["summary"]["placed"], v["summary"]["classes"])
        for c in v["classes"]:
            self.assertTrue(c["reasons"], c)
        # the movable lunch: one hour a day for every group, at 11:00 or 12:00, never under a class
        self.assertEqual(len(v["lunch"]), len(v["groups"]) * len(v["days"]))
        hidx = {h: i for i, h in enumerate(v["hours"])}
        for l in v["lunch"]:
            self.assertIn(l["hour"], ("11:00", "12:00"))
            for c in v["classes"]:
                if c["day"] == l["day"] and l["group"] in c["groups"]:
                    self.assertFalse(hidx[c["hour"]] <= hidx[l["hour"]] < hidx[c["hour"]] + c["hours"], (c, l))
        # a hand move: only that class changes, it is pinned
        cls = next(c for c in v["classes"] if c["kind"] == "P")
        opt = next(o for o in self.c.get("/api/sched/%s/options/%s" % (sid, cls["key"])).json()
                   if o["ok"] and (o["day"], o["hour"]) != (cls["day"], cls["hour"]))
        bad = [o for o in self.c.get("/api/sched/%s/options/%s" % (sid, cls["key"])).json() if not o["ok"]]
        self.assertTrue(all(o["why"] and ":" not in o["why"].split("(")[0] for o in bad if "มี" in (o["why"] or "")))  # keys shown as code + kind
        v2 = self.c.post("/api/sched/%s/move" % sid, json={"key": cls["key"], "day": opt["day"], "hour": opt["hour"]}).json()
        before = {c["key"]: (c["day"], c["hour"]) for c in v["classes"]}
        after = {c["key"]: (c["day"], c["hour"]) for c in v2["classes"]}
        self.assertEqual({k for k in before if before[k] != after[k]}, {cls["key"]})
        moved = next(c for c in v2["classes"] if c["key"] == cls["key"])
        self.assertTrue(moved["pinned"] and moved["grade"] == "fixed")
        self.assertEqual(v2["summary"]["hard_breaks"], 0)
        # a clash is refused
        clash = next(o for o in self.c.get("/api/sched/%s/options/%s" % (sid, cls["key"])).json() if not o["ok"])
        r = self.c.post("/api/sched/%s/move" % sid, json={"key": cls["key"], "day": clash["day"], "hour": clash["hour"]})
        self.assertEqual(r.status_code, 409)
        # teachers: one name on two classes that sit at the same time in different years -> a clash in their week
        by_time = {}
        for c in v2["classes"]:
            if c["day"]:
                by_time.setdefault((c["day"], c["hour"]), []).append(c)
        a, b = next(x for x in by_time.values() if len({y["students_set"].split("/")[0] for y in x}) > 1 and len(x) > 1)[:2]
        for k in (a["key"], b["key"]):
            self.c.put("/api/sched/%s/teachers" % sid, json={"key": k, "names": ["ครูทดสอบ"]})
        week = self.c.get("/api/sched/%s/teacher" % sid, params={"name": "ครูทดสอบ"}).json()
        self.assertEqual(len(week["clashes"]), 1)
        # schedule again: the pinned class stays, the teacher is kept apart
        e2 = self.run_term(sid, term=1, groups=2)
        self.assertEqual(e2["status"], "solved", e2)
        again = next(c for c in e2["view"]["classes"] if c["key"] == cls["key"])
        self.assertEqual((again["day"], again["hour"]), (opt["day"], opt["hour"]))
        self.assertEqual(self.c.get("/api/sched/%s/teacher" % sid, params={"name": "ครูทดสอบ"}).json()["clashes"], [])
        # export
        data = self.c.get("/api/sched/%s/export.json" % sid).json()
        self.assertEqual(data["schema"], "timetable-schedule/1")
        self.assertTrue(self.c.get("/api/sched/%s/export.csv" % sid).text.startswith("﻿code,"))

    def test_from_the_exported_file_and_a_course_list(self):
        exported = self.c.get("/api/jobs/%s/export.csv" % self.ced).content
        sid = self.c.post("/api/sched/upload", files={"file": ("ced.csv", exported, "text/csv")}).json()["id"]
        self.assertEqual(self.run_term(sid, term=2)["status"], "solved")
        if not (HERE / "vocational/รายวิชา ธุรกิจการบิน สัตหีบ (course list).pdf").exists():
            return
        sid = self.c.post("/api/sched/from-ingest/" + self.ingest("aviation")).json()["id"]
        st = self.c.get("/api/sched/" + sid).json()
        self.assertEqual(st["kind"], "course_list")
        codes = st["settings"]["codes"][:8]                              # the planner picks this term's subjects
        e = self.run_term(sid, codes=codes, first="08:00", last="18:00")
        self.assertEqual(e["status"], "solved", e)
        self.assertEqual({c["code"] for c in e["view"]["classes"]}, set(codes))


if __name__ == "__main__":
    unittest.main()
