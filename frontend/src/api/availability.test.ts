import {
  fillForTeacher, getAvailability, getRound, myRounds, openRound, remind, resetMockAvailability, roundComplete,
  saveAvailability, setAvailabilityClock, slot, submitRound,
} from './availability';
import { resetMockProfiles } from './profiles';

const T0 = 1_800_000_000_000;
const DAY = 24 * 3600 * 1000;
beforeEach(() => { resetMockProfiles(); resetMockAvailability(); setAvailabilityClock(() => T0); });

test('เปิดรอบ: ตรวจอาจารย์ >= 1 และกำหนดส่งต้องเป็นอนาคต, เปิดซ้ำไม่ได้', async () => {
  await expect(openRound('p1', { teacher_ids: [], deadline: T0 + DAY })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 - 1 })).rejects.toMatchObject({ code: 'VALIDATION' });
  await openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 + DAY });
  await expect(openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 + DAY })).rejects.toMatchObject({ code: 'ROUND_EXISTS' });
});

test('กระดานสถานะ: ยังไม่ส่ง -> ส่งแล้ว, เลยกำหนดโดยไม่ส่ง = ล่าช้า', async () => {
  const r = await openRound('p1', { teacher_ids: ['u-teacher', 'u-other'], deadline: T0 + DAY });
  expect((await getRound('p1'))!.board.map((b) => b.status)).toEqual(['not_yet', 'not_yet']);
  await saveAvailability('u-teacher', r.term_id, { busy: [slot(0, 1), slot(0, 2)], maxHoursPerDay: 6 });
  const receipt = await submitRound(r.id, 'u-teacher');
  expect(receipt.busy_count).toBe(2);
  expect(receipt.message).toContain('ไม่ว่าง 2 คาบ');
  setAvailabilityClock(() => T0 + 2 * DAY);
  expect((await getRound('p1'))!.board.map((b) => b.status)).toEqual(['submitted', 'late']);
});

test('ส่งโดยยังไม่บันทึกเวลาว่าง -> NOT_FILLED', async () => {
  const r = await openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 + DAY });
  await expect(submitRound(r.id, 'u-teacher')).rejects.toMatchObject({ code: 'NOT_FILLED' });
});

test('ค่าชั่วโมงสูงสุดต่อวัน 1–12 และเก็บครั้งเดียวต่อคนต่อภาค (บันทึกซ้ำทับของเดิม)', async () => {
  await expect(saveAvailability('u', 't', { busy: [], maxHoursPerDay: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
  await saveAvailability('u', 't', { busy: [slot(1, 1)], maxHoursPerDay: 6 });
  await saveAvailability('u', 't', { busy: [slot(2, 2), slot(2, 2)], maxHoursPerDay: 5 });
  expect(await getAvailability('u', 't')).toMatchObject({ busy: ['2-2'], maxHoursPerDay: 5 });
  expect(await getAvailability('u', 'อีกภาค')).toBeNull();
});

test('แก้ได้จนถึงกำหนดส่ง: หลังกำหนดอาจารย์แก้ไม่ได้ (AFTER_DEADLINE) แต่หัวหน้าแก้ได้', async () => {
  const r = await openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 + DAY });
  await saveAvailability('u-teacher', r.term_id, { busy: [], maxHoursPerDay: 6 });
  await submitRound(r.id, 'u-teacher');
  await saveAvailability('u-teacher', r.term_id, { busy: [slot(0, 1)], maxHoursPerDay: 6 }); // ก่อนกำหนด ได้
  setAvailabilityClock(() => T0 + 2 * DAY);
  await expect(saveAvailability('u-teacher', r.term_id, { busy: [], maxHoursPerDay: 6 })).rejects.toMatchObject({ code: 'AFTER_DEADLINE' });
  await saveAvailability('u-teacher', r.term_id, { busy: [], maxHoursPerDay: 6 }, true);
});

test('เตือน: เฉพาะคนที่ยังไม่ตอบ และบันทึกเวลาที่เตือน', async () => {
  const r = await openRound('p1', { teacher_ids: ['a', 'b'], deadline: T0 + DAY });
  await saveAvailability('a', r.term_id, { busy: [], maxHoursPerDay: 6 });
  await submitRound(r.id, 'a');
  expect(await remind(r.id)).toEqual(['b']);
  expect((await getRound('p1'))!.board.find((x) => x.user_id === 'b')!.reminded_at).toBe(T0);
});

test('หัวหน้ากรอกแทน: ว่างทุกเวลา / กรอกค่าเอง บันทึกว่าใครแก้ และขั้น 3 เสร็จเมื่อทุกคนมีคำตอบ', async () => {
  const r = await openRound('p1', { teacher_ids: ['a', 'b'], deadline: T0 + DAY });
  expect(roundComplete((await getRound('p1'))!.round)).toBe(false);
  await fillForTeacher(r.id, 'a', 'u-head', { any_time: true });
  await fillForTeacher(r.id, 'b', 'u-head', { busy: [slot(4, 8)], maxHoursPerDay: 4 });
  const { round, board } = (await getRound('p1'))!;
  expect(board.map((x) => x.status)).toEqual(['any_time', 'filled_by_head']);
  expect(round.responses.b.by).toBe('u-head');
  expect(roundComplete(round)).toBe(true);
  expect((await getAvailability('b', r.term_id))!.busy).toEqual(['4-8']);
});

test('4.1 รอบที่ต้องตอบของอาจารย์: มีชื่อโปรไฟล์และสถานะ', async () => {
  await openRound('p1', { teacher_ids: ['u-teacher'], deadline: T0 + DAY });
  const mine = await myRounds('u-teacher');
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ status: 'not_yet', profileName: 'ตารางเรียน ภาค 2/2569' });
  expect(await myRounds('คนอื่น')).toHaveLength(0);
});
