import { MOCK_USERS, resetMockAuth } from './auth';
import { getProfile, resetMockProfiles, sendToReview, updateStep } from './profiles';
import { saveLastRun, type UiRun } from './runs';
import {
  createRequest, decideRequest, directEdit, impactFor, isMine, listLog, listNotifications, listRequests, myRequests, resetMockReview,
} from './review';
import type { ClassItem } from '../types';

const item = (id: string, over: Partial<ClassItem> = {}): ClassItem => ({ id, day: 0, start: 1, span: 2, code: `ท.${id}`, name: 'วิชา', room: `R${id}`, teacher: `ครู${id}`, status: 'ok', ...over });
const teacher = MOCK_USERS.find((u) => u.id === 'u-teacher')!;
const head = { id: 'u-head', name: 'หัวหน้า สายชล' };

async function inReview() {
  const p = await getProfile('p1');
  // ทำขั้น 1–7 ของทุกแท็บให้ครบด้วยกฎของ mock (ปี 2 ทำถึงขั้น 2 แล้ว)
  for (const y of p.year_plans) for (let s = 0; s < 7; s++) if (y.steps[s] !== 'done') await updateStep('p1', y.id, s, 'complete');
  await sendToReview('p1');
}
const run = (placed: ClassItem[]): UiRun => ({ status: 'ok', score: 90, placed, unplaced: [] });

beforeEach(() => { resetMockAuth(); resetMockProfiles(); resetMockReview(); sessionStorage.clear(); });

test('isMine: ชื่อสั้นในตารางอยู่ในชื่อเต็มของบัญชี (รวมครูร่วมที่คั่นด้วย +)', () => {
  expect(isMine(teacher, item('a', { teacher: 'ปฐพนพัทธ์' }))).toBe(true);
  expect(isMine(teacher, item('a', { teacher: 'ลี + ปฐพนพัทธ์' }))).toBe(true);
  expect(isMine(teacher, item('a', { teacher: 'ไมตรี' }))).toBe(false);
});

test('ส่งเข้าตรวจทาน: ต้องทำขั้น 1–7 ครบก่อน (STEP_INCOMPLETE)', async () => {
  await expect(sendToReview('p1')).rejects.toMatchObject({ code: 'STEP_INCOMPLETE' });
  await inReview();
  expect((await getProfile('p1')).status).toBe('review');
});

test('ขอเปลี่ยน: ต้องอยู่ใน REVIEW, เป็นคาบของตัวเอง, มีเหตุผล, ไม่ขอซ้ำ; มี impact', async () => {
  saveLastRun('p1', run([item('a', { teacher: 'ปฐพนพัทธ์', room: 'R' }), item('b', { teacher: 'ลี', room: 'R', start: 5 }), item('c', { teacher: 'ลี', day: 1 })]));
  await expect(createRequest('p1', teacher, { class_id: 'a', reason: 'x' })).rejects.toMatchObject({ code: 'NOT_IN_REVIEW' });
  await inReview();
  await expect(createRequest('p1', teacher, { class_id: 'c', reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(createRequest('p1', teacher, { class_id: 'a', reason: '  ' })).rejects.toMatchObject({ code: 'VALIDATION' });
  const r = await createRequest('p1', teacher, { class_id: 'a', reason: 'มีสอนที่อื่น' });
  expect(r).toMatchObject({ status: 'waiting', impact: 'ต้องขยับอีก 1 คาบ (ท.b)' });
  await expect(createRequest('p1', teacher, { class_id: 'a', reason: 'อีกครั้ง' })).rejects.toMatchObject({ code: 'ALREADY_REQUESTED' });
  expect((await myRequests('u-teacher'))).toHaveLength(1);
  expect(await listRequests('p1')).toHaveLength(1);
});

test('impactFor: ไม่กระทบถ้าไม่มีคาบวันเดียวกันที่ใช้ครู/ห้องเดียวกัน', () => {
  expect(impactFor([item('a'), item('b', { day: 3 })], 'a')).toBe('ไม่กระทบคาบอื่น');
  expect(impactFor([], 'a')).toBe('ไม่ทราบผลกระทบ');
});

test('ตัดสินคำขอ: ปฏิเสธต้องมีหมายเหตุ, อนุมัติ/ปฏิเสธแจ้งอาจารย์, ตัดสินซ้ำไม่ได้', async () => {
  saveLastRun('p1', run([item('a', { teacher: 'ปฐพนพัทธ์' })]));
  await inReview();
  const r = await createRequest('p1', teacher, { class_id: 'a', reason: 'ติดธุระ' });
  await expect(decideRequest(r.id, 'u-head', { approve: false, note: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
  const done = await decideRequest(r.id, 'u-head', { approve: false, note: 'ไม่มีคาบว่างให้ย้าย' });
  expect(done).toMatchObject({ status: 'rejected', decided_by: 'u-head' });
  await expect(decideRequest(r.id, 'u-head', { approve: true, note: '' })).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  expect((await listNotifications('u-teacher'))[0].body).toBe('คำขอเปลี่ยนของคุณถูกปฏิเสธ: ไม่มีคาบว่างให้ย้าย');
});

test('direct edit: ต้องระบุตกลงกับใคร, ห้ามชน, บันทึกเก่า→ใหม่, แจ้งอาจารย์ "แก้โดย …"', async () => {
  saveLastRun('p1', run([item('a', { teacher: 'ปฐพนพัทธ์', room: 'R1' }), item('b', { teacher: 'ไมตรี', room: 'R2', day: 1, start: 1 })]));
  await inReview();
  await expect(directEdit('p1', head, 'a', { day: 2, start: 3 }, ' ')).rejects.toMatchObject({ code: 'VALIDATION' });
  // ย้ายไปวันอังคารคาบ 1 ชน b? teacher ต่างกัน ห้องต่างกัน -> ไม่ชน จึงสำเร็จ
  const e = await directEdit('p1', head, 'a', { day: 2, start: 3 }, 'ครูปฐพนพัทธ์');
  expect(e).toMatchObject({ old_value: { day: 0, start: 1 }, new_value: { day: 2, start: 3 }, agreed_with: 'ครูปฐพนพัทธ์', request_id: null });
  expect((await listLog('p1'))).toHaveLength(1);
  expect((await listNotifications('u-teacher'))[0].body).toBe('แก้โดย หัวหน้า สายชล: ย้าย ท.a (ตกลงกับ ครูปฐพนพัทธ์)');
});

test('direct edit ที่ทำให้ชนถูกปฏิเสธ (CLASH) และข้อมูลไม่เปลี่ยน', async () => {
  saveLastRun('p1', run([item('a', { teacher: 'ปฐพนพัทธ์', room: 'R1' }), item('b', { teacher: 'ปฐพนพัทธ์', room: 'R2', day: 1, start: 1 })]));
  await inReview();
  await expect(directEdit('p1', head, 'a', { day: 1, start: 2 }, 'ใครสักคน')).rejects.toMatchObject({ code: 'CLASH' });
  expect(await listLog('p1')).toHaveLength(0);
});

test('เผยแพร่แล้ว direct edit ไม่ได้ (VERSION_LOCKED)', async () => {
  saveLastRun('p1', run([item('a', { teacher: 'ปฐพนพัทธ์' })]));
  await inReview();
  const { publishProfile } = await import('./profiles');
  const p = await getProfile('p1');
  for (const y of p.year_plans) for (let s = 7; s < 8; s++) await updateStep('p1', y.id, s, 'complete');
  await publishProfile('p1', 'HEAD');
  await expect(directEdit('p1', head, 'a', { day: 3, start: 3 }, 'x')).rejects.toMatchObject({ code: 'VERSION_LOCKED' });
});
