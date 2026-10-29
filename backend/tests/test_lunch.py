"""The movable lunch hour (11-12 or 12-13): no class may cover the WHOLE window, and a block too long to leave a
lunch hour is off-site practice (found by the rubric test on Chonburi: FET got stuck at 574 of 761 classes)."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(p) for p in (ROOT.parent / "algorithm", ROOT / "engine") if p.is_dir()]
from solver.model import longest, starts            # noqa: E402

HOURS = ["%02d:00" % h for h in range(8, 18)]          # 08-18, no break: the window is inside the day


class TestLunch(unittest.TestCase):
    def test_no_block_covers_the_whole_window(self):
        p = {"hours": HOURS, "lunch": {"window": ["11:00", "12:00"]}}
        for n in range(1, 11):
            for i in starts(p, n):
                covered = set(HOURS[i:i + n])
                self.assertFalse({"11:00", "12:00"} <= covered, (n, HOURS[i]))
        self.assertEqual(longest(p), 6)                  # 12:00-18:00; 7 hours cannot leave a lunch hour
        self.assertEqual(starts(p, 2), [0, 1, 2, 4, 5, 6, 7, 8])   # 10-12 and 12-14 fine, 11-13 not

    def test_fixed_lunch_is_a_break(self):
        p = {"hours": [h for h in HOURS if h != "12:00"]}
        self.assertEqual(longest(p), 5)                  # 13:00-18:00


if __name__ == "__main__":
    unittest.main()
