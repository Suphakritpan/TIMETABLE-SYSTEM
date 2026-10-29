import { loadLastRun, saveLastRun } from './runs';
import { viewToUiRun, type SchedClass, type SchedView } from './schedule';

const cls = (over: Partial<SchedClass> = {}): SchedClass => ({
  key: 'k1', code: 'ท.1', name_th: 'วิชา 1', kind: 'L', kind_th: 'บรรยาย', hours: 2, students_set: 'G1', groups: ['G1'], students: 30,
  day: 'อังคาร', hour: '10:00', room: 'R1', grade: 'pass', reasons: [], pinned: false, moved: false, teachers: ['ลี', 'ไมตรี'], ...over,
});
const view = (classes: SchedClass[], hard = 0): SchedView => ({
  days: ['จันทร์', 'อังคาร'], hours: ['08:00', '09:00', '10:00'], groups: ['G1'], rooms: [], flag: false, lunch: [], classes, breaks: [],
  summary: { classes: classes.length, placed: 0, hard_breaks: hard, quality: 88, parts: {}, pass: 0, check: 0, fix: 0, fixed: 0, pinned: 0, moved: 0 },
  indicators: { rooms: [], groups: [], teachers: [] },
});

test('คาบที่จัดแล้ว: วัน/คาบเริ่มเป็นดัชนีของตาราง ครูต่อด้วย +', () => {
  const r = viewToUiRun(view([cls()]));
  expect(r.placed[0]).toMatchObject({ id: 'k1', day: 1, start: 3, span: 2, room: 'R1', teacher: 'ลี + ไมตรี', status: 'ok', group: 'G1' });
  expect(r.status).toBe('ok');
  expect(r.score).toBe(88);
});
test('สถานะคาบ: ผิดกฎ=conflict ปักหมุด=pinned ย้ายโดยคน=edited', () => {
  const r = viewToUiRun(view([cls({ key: 'a', grade: 'fix' }), cls({ key: 'b', pinned: true }), cls({ key: 'c', moved: true })]));
  expect(r.placed.map((p) => p.status)).toEqual(['conflict', 'pinned', 'edited']);
});
test('คาบที่ยังไม่ได้จัดอยู่ใน unplaced พร้อมเหตุผล และผลเป็น partial', () => {
  const r = viewToUiRun(view([cls({ key: 'u', day: null, hour: null, room: null, reasons: [{ th: 'ไม่มีห้องว่าง', level: 'red' }] })]));
  expect(r.placed).toHaveLength(0);
  expect(r.unplaced[0]).toMatchObject({ id: 'u', span: 2, reason: 'ไม่มีห้องว่าง' });
  expect(r.status).toBe('partial');
});
test('ผิดกฎบังคับ -> partial แม้ทุกคาบลงแล้ว', () => {
  expect(viewToUiRun(view([cls()], 1)).status).toBe('partial');
});
test('เก็บและอ่านผลล่าสุดต่อโปรไฟล์ (รีเฟรชไม่หาย)', () => {
  const r = viewToUiRun(view([cls()]));
  saveLastRun('p9', r);
  expect(loadLastRun('p9')).toEqual(r);
  expect(loadLastRun('ไม่มี')).toBeNull();
});
