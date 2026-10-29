// mock ของ POST /api/auth/login และ GET /api/me (api.md §2) ใช้จนกว่าอานนท์ส่ง API จริง
// บัญชีทดลองทั้งหมดใช้รหัส "demo" ห้ามนำไปใช้นอกเครื่องพัฒนา
import { persist } from './persist';
import type { Membership, User } from '../types';
import { ApiException } from './types';

const DEMO_PASSWORD = 'demo';
const d1 = { department_id: 'd1', department_name: 'แผนกวิชาคอมพิวเตอร์' };
const d2 = { department_id: 'd2', department_name: 'แผนกวิชาไฟฟ้า' };
const base = { language: 'th' as const };

const SEED_USERS: User[] = [
  { ...base, id: 'u-head', name: 'นางสมหญิง ตัวอย่าง', email: 'head@demo.test', position: 'หัวหน้าแผนก', phone: '081-234-5678', line_id: 'somying.head', office: 'อาคาร 2 ห้อง 201', is_admin: false, memberships: [{ ...d1, role: 'HEAD' }] },
  { ...base, id: 'u-assist', name: 'นายสมมติ ผู้ช่วย', email: 'assistant@demo.test', position: 'ผู้ช่วยหัวหน้าแผนก', phone: '082-345-6789', line_id: 'sommati.a', office: 'อาคาร 2 ห้อง 202', is_admin: false, memberships: [{ ...d1, role: 'ASSISTANT' }] },
  { ...base, id: 'u-teacher', name: 'นายทดลอง รักเรียน', email: 'teacher@demo.test', position: 'ครูผู้สอน', phone: '083-456-7890', line_id: 'thodlong.t', office: 'อาคาร 3 ห้อง 305', is_admin: false, memberships: [{ ...d1, role: 'TEACHER' }] },
  { ...base, id: 'u-admin', name: 'ผู้ดูแลสถาบัน', email: 'admin@demo.test', is_admin: true, memberships: [] },
  { ...base, id: 'u-multi', name: 'นางสาวสมจินต์ (หลายบทบาท)', email: 'multi@demo.test', is_admin: true, memberships: [{ ...d1, role: 'ASSISTANT' }, { ...d2, role: 'TEACHER' }] },
];

export const MOCK_USERS: User[] = structuredClone(SEED_USERS);

const registered = new Map<string, { user: User; password: string }>();
/** ใช้โดย mock ของ POST /api/setup (ผู้ดูแลคนแรก) เท่านั้น */
export function registerUser(user: User, password: string) { registered.set(user.email, { user, password }); }

const overrides = new Map<string, string>(); // รหัสผ่านที่ถูกเปลี่ยน/รีเซ็ตแล้ว (อีเมล -> รหัสผ่าน)
const passwordOf = (email: string): string | undefined =>
  overrides.get(email) ?? registered.get(email)?.password ?? (MOCK_USERS.some((u) => u.email === email) ? DEMO_PASSWORD : undefined);

/** เปลี่ยนรหัสผ่านของบัญชี (ใช้โดย account.ts: เปลี่ยนเอง / รีเซ็ต) */
export function setPassword(email: string, password: string) { overrides.set(email.trim().toLowerCase(), password); }

/** เปลี่ยนอีเมลของบัญชี (ย้ายรหัสผ่านตามไปด้วย) */
export function changeEmail(user: User, next: string) {
  const old = user.email;
  const pw = passwordOf(old);
  const reg = registered.get(old);
  user.email = next;
  if (reg) { registered.delete(old); registered.set(next, reg); }
  overrides.delete(old);
  if (pw !== undefined) overrides.set(next, pw);
}

/** รหัสผิดและอีเมลไม่มีให้ข้อความเดียวกัน (ไม่เปิดเผยว่าใครมีบัญชี) */
export async function login(email: string, password: string): Promise<User> {
  await new Promise((r) => setTimeout(r, 300));
  const key = email.trim().toLowerCase();
  const u = allUsers().find((x) => x.email === key || x.username?.toLowerCase() === key);
  if (!u || passwordOf(u.email) !== password) {
    throw new ApiException({ code: 'INVALID_CREDENTIALS', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  return u;
}

/** คืนบัญชีทดลองเป็นค่าตั้งต้น (ใช้ใน test) */
export function resetMockAuth() {
  MOCK_USERS.splice(0, MOCK_USERS.length, ...structuredClone(SEED_USERS));
  registered.clear();
  overrides.clear();
}

/** บัญชีทั้งหมด: บัญชีทดลอง + บัญชีที่สร้างจาก 0.0/0.3 */
export const allUsers = (): User[] => [...MOCK_USERS, ...[...registered.values()].map((r) => r.user)];

export function findUserByEmail(email: string): User | undefined {
  const key = email.trim().toLowerCase();
  return allUsers().find((u) => u.email === key);
}

/** ใช้โดย mock ของ POST /api/invites/{token}/accept: เพิ่มภาควิชาให้บัญชีเดิม หรือสร้างบัญชีใหม่ */
export function addMembership(user: User, m: Membership) {
  if (!user.memberships.some((x) => x.department_id === m.department_id)) user.memberships.push(m);
}

/** ตรวจรหัสผ่านโดยไม่หน่วงเวลา (ใช้ตอนผู้ใช้เดิมเข้าร่วมด้วยลิงก์เชิญ) */
export function passwordMatches(email: string, password: string): boolean {
  return passwordOf(email.trim().toLowerCase()) === password;
}

persist('auth', () => ({ users: MOCK_USERS, registered: [...registered], overrides: [...overrides] }), (v) => {
  MOCK_USERS.splice(0, MOCK_USERS.length, ...v.users);
  registered.clear(); v.registered.forEach(([k, x]: [string, { user: User; password: string }]) => registered.set(k, x));
  overrides.clear(); v.overrides.forEach(([k, x]: [string, string]) => overrides.set(k, x));
});
