// ผลรันล่าสุดต่อโปรไฟล์ (UiRun แปลงจาก backend โดย api/schedule.ts viewToUiRun)
import type { ClassItem, UnplacedItem } from '../types';

export interface UiRun {
  status: 'ok' | 'partial';
  score: number;
  placed: ClassItem[];
  unplaced: UnplacedItem[];
}

// ---------- ผลรันล่าสุดต่อโปรไฟล์ (รีเฟรชแล้วผลไม่หาย ตาม R5/api.md §7.1 "เก็บผลดีล่าสุดไว้") ----------
// ใน API จริงอยู่ที่ backend (GET /runs) ตอนนี้ใช้ sessionStorage; อ่าน/เขียนไม่ได้ก็ทำงานต่อโดยไม่จำ
const runKey = (profileId: string) => `timetable.run.${profileId}`;

export function loadLastRun(profileId: string): UiRun | null {
  try {
    const s = sessionStorage.getItem(runKey(profileId));
    return s ? (JSON.parse(s) as UiRun) : null;
  } catch {
    return null;
  }
}

export function saveLastRun(profileId: string, run: UiRun) {
  try {
    sessionStorage.setItem(runKey(profileId), JSON.stringify(run));
  } catch { /* ใช้งานต่อโดยไม่เก็บ */ }
}
