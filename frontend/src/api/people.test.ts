import { resetMockAuth, login } from './auth';
import {
  INVITE_TTL_MS, acceptInvite, addRoom, createInvite, getInvite, listPeople, listRooms, removePerson, removeRoom,
  resendInvite, resetMockPeople, setMockClock,
} from './people';

beforeEach(() => { resetMockAuth(); resetMockPeople(); });

test('รายการบุคลากรแผนก: คนที่เข้าแล้ว + คำเชิญที่ค้าง แยกแผนก', async () => {
  const p = await listPeople('d1');
  expect(p.map((x) => x.role).sort()).toEqual(['ASSISTANT', 'ASSISTANT', 'HEAD', 'TEACHER']);
  expect(p.every((x) => x.status === 'joined')).toBe(true);
  expect((await listPeople('d2')).map((x) => x.role).sort()).toEqual(['TEACHER']);
});

test('ผู้ช่วยเชิญอาจารย์ได้ แต่เชิญผู้ช่วยไม่ได้ (HEAD_ONLY); หัวหน้าเชิญได้ทั้งสองบทบาท', async () => {
  await expect(createInvite('d1', { email: 'new@x.test', role: 'ASSISTANT' }, 'ASSISTANT')).rejects.toMatchObject({ code: 'HEAD_ONLY' });
  const t = await createInvite('d1', { email: 'new@x.test', role: 'TEACHER' }, 'ASSISTANT');
  expect(t.invite_url).toMatch(/^#\/invite\/tk/);
  await createInvite('d1', { email: 'asst@x.test', role: 'ASSISTANT' }, 'HEAD');
  await expect(createInvite('d1', { email: 'x@x.test', role: 'TEACHER' }, 'TEACHER')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('เชิญซ้ำ/คนที่อยู่แล้ว/อีเมลผิด ถูกปฏิเสธ', async () => {
  await createInvite('d1', { email: 'a@x.test', role: 'TEACHER' }, 'HEAD');
  await expect(createInvite('d1', { email: 'A@x.test', role: 'TEACHER' }, 'HEAD')).rejects.toMatchObject({ code: 'ALREADY_INVITED' });
  await expect(createInvite('d1', { email: 'teacher@demo.test', role: 'TEACHER' }, 'HEAD')).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  await expect(createInvite('d1', { email: 'ไม่ใช่อีเมล', role: 'TEACHER' }, 'HEAD')).rejects.toMatchObject({ code: 'VALIDATION' });
});

test('รับคำเชิญ: ผู้ใช้ใหม่ตั้งชื่อ+รหัสผ่าน -> เข้าสู่ระบบได้ และอยู่ในรายการ joined', async () => {
  const { invite_url } = await createInvite('d1', { email: 'new@x.test', role: 'TEACHER' }, 'HEAD');
  const tk = invite_url.replace('#/invite/', '');
  expect(await getInvite(tk)).toMatchObject({ department_name: 'แผนกวิชาคอมพิวเตอร์', role: 'TEACHER', has_account: false });
  await expect(acceptInvite(tk, { name: 'สมศรี', password: 'short' })).rejects.toMatchObject({ code: 'VALIDATION' });
  const u = await acceptInvite(tk, { name: 'สมศรี', password: 'longenough1' });
  expect(u.memberships[0]).toMatchObject({ department_id: 'd1', role: 'TEACHER' });
  vi.useFakeTimers();
  const p = login('new@x.test', 'longenough1');
  await vi.advanceTimersByTimeAsync(400);
  expect((await p).name).toBe('สมศรี');
  vi.useRealTimers();
  await expect(getInvite(tk)).rejects.toMatchObject({ code: 'NOT_FOUND' }); // ใช้ได้ครั้งเดียว
});

test('รับคำเชิญ: ผู้ใช้เดิม (อยู่แผนกอื่น) เพิ่มแผนกใหม่ด้วยรหัสผ่านเดิม ไม่สร้างบัญชีซ้ำ', async () => {
  const { invite_url } = await createInvite('d2', { email: 'teacher@demo.test', role: 'TEACHER' }, 'HEAD');
  const tk = invite_url.replace('#/invite/', '');
  expect((await getInvite(tk)).has_account).toBe(true);
  await expect(acceptInvite(tk, { password: 'ผิด' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  const u = await acceptInvite(tk, { password: 'demo' });
  expect(u.memberships.map((m) => m.department_id).sort()).toEqual(['d1', 'd2']);
});

test('ลิงก์หมดอายุ -> INVITE_EXPIRED ไม่สร้างบัญชี; ส่งใหม่ได้ลิงก์ใหม่และลิงก์เก่าใช้ไม่ได้', async () => {
  const t0 = Date.now();
  setMockClock(() => t0);
  const { invite, invite_url } = await createInvite('d1', { email: 'late@x.test', role: 'TEACHER' }, 'HEAD');
  const old = invite_url.replace('#/invite/', '');
  setMockClock(() => t0 + INVITE_TTL_MS + 1);
  await expect(getInvite(old)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  await expect(acceptInvite(old, { name: 'ก', password: 'longenough1' })).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  const re = await resendInvite('d1', invite.id);
  await expect(getInvite(old)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await getInvite(re.invite_url.replace('#/invite/', ''))).email).toBe('late@x.test');
});

test('ลบบุคลากร: เฉพาะหัวหน้า ลบหัวหน้าไม่ได้ ยกเลิกคำเชิญได้', async () => {
  const people = await listPeople('d1');
  const teacher = people.find((p) => p.role === 'TEACHER')!;
  const head = people.find((p) => p.role === 'HEAD')!;
  await expect(removePerson('d1', teacher, 'ASSISTANT')).rejects.toMatchObject({ code: 'HEAD_ONLY' });
  await expect(removePerson('d1', head, 'HEAD')).rejects.toMatchObject({ code: 'CANNOT_REMOVE_HEAD' });
  await removePerson('d1', teacher, 'HEAD');
  expect((await listPeople('d1')).some((p) => p.id === teacher.id)).toBe(false);
  const { invite } = await createInvite('d1', { email: 'c@x.test', role: 'TEACHER' }, 'HEAD');
  await removePerson('d1', { id: invite.id, status: 'invited' }, 'HEAD');
  expect((await listPeople('d1')).some((p) => p.email === 'c@x.test')).toBe(false);
});

test('ห้องของแผนก: เพิ่ม/ลบ ตรวจชื่อซ้ำและที่นั่ง', async () => {
  expect(await listRooms('d1')).toHaveLength(2);
  const r = await addRoom('d1', { name: 'COM701', type: 'ห้องเรียน', seats: 25, location: 'อาคาร 7' });
  await expect(addRoom('d1', { name: 'COM701', type: 'ห้องเรียน', seats: 25, location: 'อาคาร 7' })).rejects.toMatchObject({ code: 'DUPLICATE' });
  await expect(addRoom('d1', { name: 'X', type: 'ห้องเรียน', seats: 0, location: 'อาคาร 7' })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(addRoom('d1', { name: 'Y', type: 'ห้องเรียน', seats: 5, location: ' ' })).rejects.toMatchObject({ code: 'VALIDATION' });
  await removeRoom('d1', r.id);
  expect(await listRooms('d1')).toHaveLength(2);
});

test('รับคำเชิญ: เก็บข้อมูลโปรไฟล์ครบ และตรวจชื่อผู้ใช้/เบอร์โทร', async () => {
  const { invite } = await createInvite('d1', { email: 'full@school.test', role: 'TEACHER' }, 'HEAD');
  const bad = { first_name: 'ก', last_name: 'ข', password: 'longenough1' };
  await expect(acceptInvite(invite.token, { ...bad, username: 'x!' })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(acceptInvite(invite.token, { ...bad, phone: 'abc' })).rejects.toMatchObject({ code: 'VALIDATION' });
  const u = await acceptInvite(invite.token, { ...bad, username: 'full.user', phone: '081-234-5678', language: 'en' });
  expect(u).toMatchObject({ name: 'ก ข', username: 'full.user', first_name: 'ก', last_name: 'ข', phone: '081-234-5678', language: 'en', status: 'active' });
});
