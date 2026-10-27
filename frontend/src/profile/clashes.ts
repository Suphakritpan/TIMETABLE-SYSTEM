// ตรวจการชนต่อการมอบหมาย (flows F8 ข้อ 2): ครูคนเดียวหรือห้องเดียวกันในเวลาที่ทับกัน
// ตัวจริงตรวจที่ POST /api/check (api.md §8.1) ฟังก์ชันนี้ใช้กับ mock และตรวจสดตอนเปลี่ยนห้อง
import type { ClassItem } from '../types';

const teachersOf = (i: ClassItem) => i.teacher.split(' + ').map((t) => t.trim()).filter(Boolean);
const overlap = (a: ClassItem, b: ClassItem) => a.day === b.day && a.start < b.start + b.span && b.start < a.start + a.span;

/** id ช่อง -> ข้อความอธิบายการชน (ไม่ชนไม่มีใน Map) */
export function findClashes(items: ClassItem[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, msg: string) => out.set(id, [...(out.get(id) ?? []), msg]);
  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) {
      if (!overlap(a, b)) continue;
      const sharedTeachers = teachersOf(a).filter((t) => teachersOf(b).includes(t));
      for (const t of sharedTeachers) {
        add(a.id, `ครู ${t} ซ้อนกับ ${b.code}`);
        add(b.id, `ครู ${t} ซ้อนกับ ${a.code}`);
      }
      if (a.room && a.room === b.room) {
        add(a.id, `ห้อง ${a.room} ซ้อนกับ ${b.code}`);
        add(b.id, `ห้อง ${a.room} ซ้อนกับ ${a.code}`);
      }
    }
  });
  return out;
}
