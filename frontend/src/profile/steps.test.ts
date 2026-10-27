import { canOpen, complete, edit, frontier, impactOfEdit, initialSteps, lockReason, view, type StepStatus } from './steps';

const doneUpTo = (n: number): StepStatus[] => initialSteps().map((_, i) => (i < n ? 'done' : 'todo'));

test('เริ่มต้น: ขั้น 1 เป็น current ที่เหลือ locked', () => {
  const s = initialSteps();
  expect(view(s, 0)).toBe('current');
  expect(view(s, 1)).toBe('locked');
  expect(canOpen(s, 0)).toBe(true);
  expect(canOpen(s, 2)).toBe(false);
});

test('ขั้นถัดไปปลดล็อกเมื่อขั้นก่อนเสร็จ และข้ามขั้นไม่ได้ (STEP_LOCKED)', () => {
  let s = complete(initialSteps(), 0);
  expect(view(s, 1)).toBe('current');
  expect(() => complete(s, 3)).toThrow('STEP_LOCKED');
  s = complete(s, 1);
  expect(frontier(s)).toBe(2);
});

test('เหตุผลที่ล็อกบอกขั้นที่ต้องทำก่อน', () => {
  expect(lockReason(doneUpTo(2), 4)).toBe('ต้องทำขั้น "รอบเวลาว่าง" ให้เสร็จก่อน');
  expect(lockReason(doneUpTo(2), 2)).toBeNull();
});

test('แก้ขั้นที่เสร็จแล้ว -> ขั้นหลังที่เสร็จกลายเป็นล้าสมัย ขั้นก่อนและขั้นที่ยังไม่ทำไม่เปลี่ยน', () => {
  const s = doneUpTo(5); // 1-5 เสร็จ
  expect(impactOfEdit(s, 1)).toEqual([2, 3, 4]);
  const e = edit(s, 1);
  expect(e.slice(0, 2)).toEqual(['done', 'done']);
  expect(e.slice(2, 5)).toEqual(['stale', 'stale', 'stale']);
  expect(e.slice(5)).toEqual(['todo', 'todo', 'todo', 'todo']);
  expect(view(e, 2)).toBe('out_of_date');
});

test('ขั้นล้าสมัยต้องทำใหม่ตามลำดับ: ขั้นที่อยู่หลังขั้นล้าสมัยแรกเปิดไม่ได้', () => {
  const e = edit(doneUpTo(5), 1);
  expect(frontier(e)).toBe(2);
  expect(canOpen(e, 2)).toBe(true);
  expect(canOpen(e, 3)).toBe(false);
  const again = complete(e, 2);
  expect(canOpen(again, 3)).toBe(true);
  expect(view(again, 3)).toBe('out_of_date');
});

test('แก้ขั้นสุดท้ายไม่กระทบอะไร และแก้ขั้นที่ยังไม่เสร็จไม่ได้', () => {
  const all = doneUpTo(9);
  expect(impactOfEdit(all, 8)).toEqual([]);
  expect(edit(all, 8)).toEqual(all);
  expect(() => edit(doneUpTo(2), 3)).toThrow('STEP_NOT_DONE');
});

test('เสร็จครบทุกขั้น: frontier = -1 และเปิดได้ทุกขั้น', () => {
  const all = doneUpTo(9);
  expect(frontier(all)).toBe(-1);
  expect(all.every((_, i) => canOpen(all, i))).toBe(true);
});
