"""Part 1 (ingest) end to end through the API: read -> live events -> graded rows -> a person's fix -> export.
Needs the Docker image (fastapi, poppler, tesseract) and the samples folder at DEMO_SAMPLES.
Run: docker run --rm -v "$PWD/samples:/samples:ro" timetable-demo python3 -m unittest discover tests"""
import json
import os
import time
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from app.server import SAMPLES, app
except ImportError:
    TestClient = None

CED = "university/CED KMUTNB ค.อ.บ. (text).pdf"


@unittest.skipUnless(TestClient and (Path(os.environ.get("DEMO_SAMPLES", "/samples")) / CED).exists(), "needs the image + samples")
class TestIngest(unittest.TestCase):
    c = TestClient(app) if TestClient else None

    def wait(self, jid, limit=600):
        events, t0 = [], time.time()
        while time.time() - t0 < limit:
            j = self.c.get("/api/jobs/%s" % jid, params={"since": len(events)}).json()
            events += j["events"]
            if j["status"] not in ("queued", "running"):
                return j, events
            time.sleep(0.3)
        self.fail("the reading did not finish")

    def sample(self, sid):
        r = self.c.post("/api/read/sample/%s" % sid)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["id"], self.wait(r.json()["id"])

    def test_ced_graded_fixed_exported(self):
        jid, (j, events) = self.sample("ced")
        self.assertEqual(j["status"], "done", j["error"])
        names = [e["name"] for e in events if e["event"] == "stage" and e["state"] == "done"]
        for step in ("check", "text", "format", "reread", "rows", "grade"):
            self.assertIn(step, names)                                 # the live dashboard saw every step
        self.assertTrue(any(e["event"] == "format" for e in events))
        self.assertTrue(any(e["event"] == "page" for e in events))
        r = j["result"]
        self.assertEqual(r["kind"], "plan")
        self.assertEqual(r["answer"]["wrong_silent"], 0)               # never wrong without a warning
        self.assertGreaterEqual(r["answer"]["right_pct"], 95)
        self.assertGreater(r["summary"]["pass"], 40)
        for row in r["rows"]:
            self.assertTrue(row["reasons"], row)                      # every grade has a reason
        # a person fixes a row: kept as "fixed" with the old value
        i = next(x["i"] for x in r["rows"] if x["grade"] == "pass" and x["lab"] is not None)
        old = r["rows"][i]["lab"]
        out = self.c.put("/api/jobs/%s/rows/%d" % (jid, i), json={"lab": old + 2, "credits": r["rows"][i]["credits"]}).json()
        self.assertIn(out["row"]["grade"], ("fixed", "fix"))
        self.assertEqual(out["row"]["fixed"]["before"]["lab"], old)
        # the crop of the page
        crop = self.c.get("/api/jobs/%s/rows/%d/crop" % (jid, i))
        self.assertEqual(crop.status_code, 200)
        self.assertEqual(crop.content[:4], b"\x89PNG")
        # export: the contract with part 2
        data = self.c.get("/api/jobs/%s/export.json" % jid).json()
        self.assertEqual(data["schema"], "timetable-ingest/1")
        self.assertEqual(len(data["rows"]), len(r["rows"]))
        self.assertEqual(data["rows"][i]["fixed_by_person"]["before"]["lab"], old)
        csv = self.c.get("/api/jobs/%s/export.csv" % jid).text
        self.assertTrue(csv.startswith("﻿plan,year,term"))
        self.assertEqual(csv.count("\n"), len(r["rows"]) + 1)

    def test_course_list(self):
        if not (SAMPLES / "vocational/รายวิชา ธุรกิจการบิน สัตหีบ (course list).pdf").exists():
            self.skipTest("no aviation file")
        _, (j, _) = self.sample("aviation")
        self.assertEqual(j["status"], "done", j["error"])
        r = j["result"]
        self.assertEqual(r["kind"], "course_list")
        self.assertEqual(len(r["rows"]), 34)
        self.assertEqual({x["term"] for x in r["rows"]}, {0})            # terms are chosen in part 2

    def test_refused_with_a_reason(self):
        if (SAMPLES / "not-curriculum/กยศ. ประกาศหลักสูตร 2569 ฉบับที่ 2.pdf").exists():
            _, (j, _) = self.sample("loan")
            self.assertEqual(j["status"], "refused")
            self.assertIn("ไม่ใช่หลักสูตร", j["error"])
        r = self.c.post("/api/read", files={"file": ("x.pdf", b"not a pdf at all", "application/pdf")})
        j, _ = self.wait(r.json()["id"])
        self.assertEqual(j["status"], "refused")
        self.assertIn("ไม่ใช่ชนิดเอกสาร", j["error"])


if __name__ == "__main__":
    unittest.main()
