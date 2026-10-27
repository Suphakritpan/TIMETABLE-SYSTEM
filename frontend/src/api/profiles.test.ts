import { copyProfile, createProfile, getProfile, listProfiles, listTerms, resetMockProfiles, updateStep } from './profiles';
import { initialSteps } from '../profile/steps';

beforeEach(() => resetMockProfiles());

test('รายการโปรไฟล์แยกตามแผนก', async () => {
  expect(await listProfiles('d1')).toHaveLength(1);
  expect(await listProfiles('d2')).toHaveLength(0);
});

test('สร้างโปรไฟล์: ได้ year plan = หลักสูตร × ชั้นปี, เริ่มที่ขั้น 1', async () => {
  const p = await createProfile('d1', { name: ' ภาค 1/2570 ', term_id: 't-1-2570', programs: ['ปวช.', 'ปวส.'] });
  expect(p.name).toBe('ภาค 1/2570');
  expect(p.year_plans).toHaveLength(4);
  expect(p.year_plans.every((y) => y.steps.every((s) => s === 'todo'))).toBe(true);
  expect(await listProfiles('d1')).toHaveLength(2);
});

test('สร้างโปรไฟล์: ภาคเรียนนอกปฏิทิน -> TERM_NOT_IN_CALENDAR, ชื่อว่าง/ไม่เลือกหลักสูตร -> VALIDATION', async () => {
  await expect(createProfile('d1', { name: 'x', term_id: 'ไม่มี', programs: ['ปวส.'] })).rejects.toMatchObject({ code: 'TERM_NOT_IN_CALENDAR' });
  await expect(createProfile('d1', { name: '  ', term_id: 't-1-2570', programs: ['ปวส.'] })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(createProfile('d1', { name: 'x', term_id: 't-1-2570', programs: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
});

test('คัดลอกจากภาคก่อน: โครงเดิม ทุกขั้นเริ่มใหม่ ต้นฉบับไม่เปลี่ยน', async () => {
  const c = await copyProfile('p1', 't-1-2570');
  expect(c.name).toBe('สำเนาของ ตารางเรียน ภาค 2/2569');
  expect(c.term_id).toBe('t-1-2570');
  expect(c.year_plans).toHaveLength(2);
  expect(c.year_plans.every((y) => y.steps.every((s) => s === 'todo'))).toBe(true);
  expect(c.year_plans.map((y) => y.id)).not.toContain('yp101');
  const orig = await getProfile('p1');
  expect(orig.year_plans[0].steps.filter((s) => s === 'done').length).toBeGreaterThan(0);
});

test('getProfile ไม่พบ -> NOT_FOUND', async () => {
  await expect(getProfile('zzz')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('ปฏิทินมีภาคเรียน', async () => {
  expect((await listTerms()).length).toBeGreaterThan(0);
});

test('updateStep: ทำเสร็จตามลำดับ ข้ามขั้นได้ไม่ได้ (STEP_LOCKED) และแก้ขั้นที่เสร็จทำให้ขั้นหลังล้าสมัยเฉพาะ year plan นั้น', async () => {
  const p = await getProfile('p1');
  const [y1, y2] = p.year_plans; // y1 เสร็จ 5 ขั้น, y2 เสร็จ 2 ขั้น
  await expect(updateStep('p1', y2.id, 6, 'complete')).rejects.toMatchObject({ code: 'STEP_LOCKED' });
  const after = await updateStep('p1', y1.id, 1, 'edit');
  expect(after.year_plans[0].steps.slice(2, 5)).toEqual(['stale', 'stale', 'stale']);
  expect(after.year_plans[1].steps).toEqual(y2.steps);
  const done = await updateStep('p1', y2.id, 2, 'complete');
  expect(done.year_plans[1].steps[2]).toBe('done');
  await expect(updateStep('p1', y2.id, 8, 'edit')).rejects.toMatchObject({ code: 'STEP_NOT_DONE' });
  expect(initialSteps()).toHaveLength(9);
});
