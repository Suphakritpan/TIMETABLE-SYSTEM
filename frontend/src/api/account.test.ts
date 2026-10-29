import {
  RESET_TTL_MS, changePassword, confirmReset, createResetLink, getReset, requestReset, resetMockAccount, setAccountClock, updateEmail, updateMe,
} from './account';
import { login, resetMockAuth } from './auth';
import { listNotifications, notify, markRead, resetMockNotifications, unreadCount } from './notifications';

beforeEach(() => { resetMockAuth(); resetMockAccount(); resetMockNotifications(); vi.useRealTimers(); });
const tryLogin = async (email: string, pw: string) => {
  vi.useFakeTimers();
  const p = login(email, pw).then((u) => u.id, (e: Error) => e.message);
  await vi.advanceTimersByTimeAsync(400);
  const r = await p;
  vi.useRealTimers();
  return r;
};
const head = { id: 'u-head', role: 'HEAD' as const, departmentId: 'd1' };

test('1.2 แก้ชื่อ/ภาษา: ชื่อว่างถูกปฏิเสธ', async () => {
  await expect(updateMe('u-head', { name: ' ', language: 'th' })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(await updateMe('u-head', { name: ' อรทัย ', language: 'en' })).toMatchObject({ name: 'อรทัย', language: 'en' });
});

test('1.2 เปลี่ยนรหัสผ่าน: ต้องรู้รหัสเดิม, ใหม่ >= 8 และต่างจากเดิม; เข้าด้วยรหัสใหม่ได้ รหัสเก่าใช้ไม่ได้', async () => {
  await expect(changePassword('u-head', 'ผิด', 'newpassword1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  await expect(changePassword('u-head', 'demo', 'short')).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(changePassword('u-head', 'demo', 'demo')).rejects.toMatchObject({ code: 'VALIDATION' });
  await changePassword('u-head', 'demo', 'newpassword1');
  expect(await tryLogin('head@demo.test', 'newpassword1')).toBe('u-head');
  expect(await tryLogin('head@demo.test', 'demo')).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});

test('1.2 เปลี่ยนอีเมล: ยืนยันด้วยรหัสผ่าน ห้ามซ้ำ; ล็อกอินด้วยอีเมลใหม่ได้', async () => {
  await expect(updateEmail('u-head', 'new@x.test', 'ผิด')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  await expect(updateEmail('u-head', 'teacher@demo.test', 'demo')).rejects.toMatchObject({ code: 'DUPLICATE' });
  await expect(updateEmail('u-head', 'ไม่ใช่อีเมล', 'demo')).rejects.toMatchObject({ code: 'VALIDATION' });
  await updateEmail('u-head', 'Head.New@x.test', 'demo');
  expect(await tryLogin('head.new@x.test', 'demo')).toBe('u-head');
  expect(await tryLogin('head@demo.test', 'demo')).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});

test('0.2 ขอรีเซ็ตเอง: ตอบแบบเดียวกันเสมอ (ไม่บอกว่ามีอีเมลนี้) และบอกว่าไม่มีการส่งอีเมล', async () => {
  const a = await requestReset('head@demo.test');
  const b = await requestReset('nobody@x.test');
  expect(a).toEqual(b);
  expect(a.sent).toBe(false);
});

test('0.2 หัวหน้าสร้างลิงก์ให้ครูในแผนกตน → ตั้งรหัสใหม่ → ลิงก์ใช้ได้ครั้งเดียว', async () => {
  const { reset_url } = await createResetLink(head, 'u-teacher');
  const tk = reset_url.replace('#/reset/', '');
  expect(await getReset(tk)).toEqual({ name: 'นายวรากร รักเรียน' });
  await expect(confirmReset(tk, 'short')).rejects.toMatchObject({ code: 'VALIDATION' });
  await confirmReset(tk, 'brandnew-pass1');
  expect(await tryLogin('teacher@demo.test', 'brandnew-pass1')).toBe('u-teacher');
  await expect(confirmReset(tk, 'another-pass1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('0.2 ลิงก์หมดอายุ -> RESET_EXPIRED และรหัสเดิมยังใช้ได้', async () => {
  const t0 = Date.now();
  setAccountClock(() => t0);
  const { reset_url } = await createResetLink({ id: 'u-admin', role: 'ADMIN', departmentId: null }, 'u-teacher');
  setAccountClock(() => t0 + RESET_TTL_MS + 1);
  await expect(confirmReset(reset_url.replace('#/reset/', ''), 'brandnew-pass1')).rejects.toMatchObject({ code: 'RESET_EXPIRED' });
  expect(await tryLogin('teacher@demo.test', 'demo')).toBe('u-teacher');
});

test('0.2 ความปลอดภัย: หัวหน้าสร้างลิงก์ให้ ADMIN / หัวหน้าแผนกอื่น / คนนอกแผนกตนไม่ได้ ผู้ดูแลทำได้ ครูทำไม่ได้', async () => {
  await expect(createResetLink(head, 'u-admin')).rejects.toMatchObject({ code: 'RESET_NOT_ALLOWED' });
  await expect(createResetLink(head, 'u-multi')).rejects.toMatchObject({ code: 'RESET_NOT_ALLOWED' }); // เป็น ADMIN ด้วย
  await expect(createResetLink({ ...head, departmentId: 'd2' }, 'u-teacher')).rejects.toMatchObject({ code: 'RESET_NOT_ALLOWED' }); // ไม่ใช่สมาชิกแผนก d2
  await expect(createResetLink({ id: 'u-teacher', role: 'TEACHER', departmentId: 'd1' }, 'u-head')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(createResetLink({ id: 'u-admin', role: 'ADMIN', departmentId: null }, 'u-head')).resolves.toBeDefined();
});

test('1.1 แจ้งเตือน: ใหม่สุดก่อน, นับที่ยังไม่อ่าน, อ่านรายการเดียว/ทั้งหมด, แยกตามผู้ใช้', async () => {
  let t = 1000;
  const { setNotificationsClock } = await import('./notifications');
  setNotificationsClock(() => t++);
  notify('a', 'เก่า'); notify('a', 'ใหม่'); notify('b', 'ของคนอื่น');
  const list = await listNotifications('a');
  expect(list.map((n) => n.body)).toEqual(['ใหม่', 'เก่า']);
  expect(await unreadCount('a')).toBe(2);
  await markRead('a', list[0].id);
  expect(await unreadCount('a')).toBe(1);
  await markRead('a');
  expect(await unreadCount('a')).toBe(0);
  expect(await unreadCount('b')).toBe(1);
});
