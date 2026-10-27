import { adaptRun, generate } from './runs';
import { ApiException, type ApiRun, type Directory } from './types';

const dir: Directory = {
  teachers: { u1: 'ไมตรี', u2: 'ลี' },
  rooms: { rm1: 'COM602' },
  planRows: { r1: { code: 'ท.1', name: 'วิชา 1' }, r2: { code: 'ท.2', name: 'วิชา 2', span: 2 } },
};
const placed = (id: string, extra = {}) => ({
  class_id: id, plan_row_id: 'r1', group_id: 'g', teacher_ids: ['u1', 'u2'], room_id: 'rm1', day: 1, start_period: 3, span: 2, pinned: false, ...extra,
});
const run = (over: Partial<ApiRun> = {}): ApiRun => ({
  id: 'run', status: 'partial', progress: { stage: 'done', percent: 100 }, error: null,
  candidates: [
    { id: 'low', score: 50, placed: [], unplaced: [] },
    { id: 'high', score: 90, placed: [placed('k1'), placed('k2', { pinned: true })], unplaced: [{ class_id: 'k3', plan_row_id: 'r2', reason: 'ไม่ว่าง', fix: 'ปลดเวลา' }], conflicts: ['k1'] },
  ],
  ...over,
});

test('เลือกตัวเลือกคะแนนสูงสุด และแปลง id เป็นชื่อ', () => {
  const r = adaptRun(run(), dir);
  expect(r.score).toBe(90);
  expect(r.placed[0]).toMatchObject({ id: 'k1', start: 3, code: 'ท.1', room: 'COM602', teacher: 'ไมตรี + ลี' });
});
test('conflicts -> status conflict, pinned -> pinned, ที่เหลือ ok', () => {
  const r = adaptRun(run(), dir);
  expect(r.placed.map((p) => p.status)).toEqual(['conflict', 'pinned']);
});
test('ผลบางส่วนไม่ใช่ความล้มเหลว: unplaced มีเหตุผล+วิธีแก้+span จากแผน', () => {
  const r = adaptRun(run(), dir);
  expect(r.status).toBe('partial');
  expect(r.unplaced[0]).toMatchObject({ id: 'k3', code: 'ท.2', span: 2, reason: 'ไม่ว่าง', fix: 'ปลดเวลา' });
});
test('ระบุตัวเลือกเองได้ และไม่พบ -> error NO_CANDIDATE', () => {
  expect(adaptRun(run(), dir, 'low').score).toBe(50);
  expect(() => adaptRun(run(), dir, 'zzz')).toThrow(expect.objectContaining({ code: 'NO_CANDIDATE' }));
});
test('failed -> throw ApiException SOLVER_FAILED พร้อมข้อความจาก server', () => {
  const failed = run({ status: 'failed', error: { code: 'SOLVER_FAILED', message: 'ตัวจัดตารางหยุด: หมดเวลา' } });
  expect(() => adaptRun(failed, dir)).toThrow(ApiException);
  expect(() => adaptRun(failed, dir)).toThrow('หมดเวลา');
});
test('ยังไม่เสร็จ (running) ไม่แปลง', () => {
  expect(() => adaptRun(run({ status: 'running' }), dir)).toThrow(expect.objectContaining({ code: 'RUN_NOT_FINISHED' }));
});
test('mock generate(): รูปที่ UI ใช้ครบ มีทั้งคาบที่ลงและยังไม่ลง', async () => {
  vi.useFakeTimers();
  const p = generate();
  await vi.advanceTimersByTimeAsync(800);
  const r = await p;
  vi.useRealTimers();
  expect(r.status).toBe('partial');
  expect(r.placed.length).toBeGreaterThan(0);
  expect(r.placed.some((c) => c.status === 'conflict')).toBe(true);
  expect(r.unplaced.length).toBe(2);
  expect(r.placed.every((c) => c.teacher && c.room && c.code)).toBe(true);
});
test('mock generate({fail}) -> SOLVER_FAILED', async () => {
  vi.useFakeTimers();
  const p = generate({ fail: true });
  const assertion = expect(p).rejects.toMatchObject({ code: 'SOLVER_FAILED' });
  await vi.advanceTimersByTimeAsync(800);
  await assertion;
  vi.useRealTimers();
});
