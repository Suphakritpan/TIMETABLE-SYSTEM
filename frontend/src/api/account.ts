// mock ของ api.md §2: PATCH /api/me (1.2) และรีเซ็ตรหัสผ่าน (0.2, decisions D12 ข้อ 4)
//  - ไม่มี SMTP: ผู้ดูแล/หัวหน้าสร้างลิงก์รีเซ็ตให้คัดลอกส่งเอง (ใช้ครั้งเดียว หมดอายุ 24 ชม.)
//  - ลิงก์รีเซ็ต = ยึดบัญชีได้ทั้งบัญชี: หัวหน้าสร้างได้เฉพาะสมาชิกแผนกตน ที่ไม่ใช่ ADMIN และไม่เป็นหัวหน้าแผนกอื่น
// ❓ กฎรหัสผ่านและอายุลิงก์ ยังไม่ตกลงกับอานนท์ (ร่าง 8 ตัวอักษร / 24 ชม.)
import { persist } from './persist';
import type { Role, User } from '../types';
import { allUsers, changeEmail, passwordMatches, setPassword } from './auth';
import { MIN_PASSWORD } from './institution';
import { ApiException } from './types';
import { delay } from './util';

export const RESET_TTL_MS = 24 * 3600 * 1000;

let now = () => Date.now();
export const setAccountClock = (fn: () => number) => { now = fn; };
let seq = 0;
interface Reset { token: string; user_id: string; expires_at: number; used: boolean; created_by: string }
let resets: Reset[] = [];
export function resetMockAccount() { seq = 0; resets = []; now = () => Date.now(); }

const userById = (id: string): User => {
  const u = allUsers().find((x) => x.id === id);
  if (!u) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบบัญชี' });
  return u;
};
const checkPassword = (pw: string) => {
  if (pw.length < MIN_PASSWORD) throw new ApiException({ code: 'VALIDATION', message: `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` });
};

/** แก้ชื่อ/ภาษา (1.2) */
export async function updateMe(userId: string, input: { name: string; language: 'th' | 'en'; phone?: string; avatar?: string }): Promise<User> {
  await delay();
  const u = userById(userId);
  if (!input.name.trim()) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อ' });
  u.name = input.name.trim();
  u.language = input.language;
  if (input.phone !== undefined) u.phone = input.phone.trim() || undefined;
  if ('avatar' in input) u.avatar = input.avatar;
  return structuredClone(u);
}

/** เปลี่ยนอีเมล: ต้องยืนยันด้วยรหัสผ่านปัจจุบัน และห้ามซ้ำกับบัญชีอื่น */
export async function updateEmail(userId: string, email: string, password: string): Promise<User> {
  await delay();
  const u = userById(userId);
  const next = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(next)) throw new ApiException({ code: 'VALIDATION', message: 'อีเมลไม่ถูกต้อง' });
  if (!passwordMatches(u.email, password)) throw new ApiException({ code: 'INVALID_CREDENTIALS', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  if (allUsers().some((x) => x.id !== u.id && x.email === next)) throw new ApiException({ code: 'DUPLICATE', message: 'มีบัญชีใช้อีเมลนี้แล้ว' });
  changeEmail(u, next);
  return structuredClone(u);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  await delay();
  const u = userById(userId);
  if (!passwordMatches(u.email, current)) throw new ApiException({ code: 'INVALID_CREDENTIALS', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  checkPassword(next);
  if (next === current) throw new ApiException({ code: 'VALIDATION', message: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม' });
  setPassword(u.email, next);
}

/** โอนสิทธิ์ผู้ดูแลสถาบันให้บัญชีอื่น (ผู้โอนเสียสิทธิ์): ต้องเป็นผู้ดูแล + ยืนยันด้วยรหัสผ่านปัจจุบัน */
export async function transferAdmin(userId: string, targetId: string, password: string): Promise<User> {
  await delay();
  const me = userById(userId);
  if (!me.is_admin) throw new ApiException({ code: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลสถาบันเท่านั้น' });
  if (!passwordMatches(me.email, password)) throw new ApiException({ code: 'INVALID_CREDENTIALS', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  if (targetId === me.id) throw new ApiException({ code: 'VALIDATION', message: 'เลือกบัญชีอื่นที่ไม่ใช่ตัวเอง' });
  userById(targetId).is_admin = true;
  me.is_admin = false;
  return structuredClone(me);
}

/** 0.2 ผู้ใช้ขอเอง: ตอบสำเร็จเสมอ ไม่บอกว่ามีอีเมลนี้ไหม; ไม่มี SMTP จึงไม่มีอะไรถูกส่ง (ให้ขอลิงก์จากหัวหน้า/ผู้ดูแล) */
export async function requestReset(_email: string): Promise<{ sent: false; message: string }> {
  await delay();
  return { sent: false, message: 'ถ้าอีเมลนี้มีในระบบและสถาบันตั้งค่าอีเมลไว้ เราจะส่งลิงก์ให้ ถ้าไม่ได้รับ ให้ขอลิงก์จากหัวหน้า/ผู้ดูแลระบบสถาบัน' };
}

/** ผู้ดูแล/หัวหน้าสร้างลิงก์รีเซ็ตให้ผู้ใช้ (คัดลอกส่งเอง) */
export async function createResetLink(actor: { id: string; role: Role | null; departmentId: string | null }, targetUserId: string): Promise<{ reset_url: string; expires_at: number }> {
  await delay();
  const t = userById(targetUserId);
  if (actor.role === 'HEAD') {
    const inMyDept = t.memberships.some((m) => m.department_id === actor.departmentId);
    const isHeadElsewhere = t.memberships.some((m) => m.role === 'HEAD' && m.department_id !== actor.departmentId);
    if (!inMyDept || t.is_admin || isHeadElsewhere) {
      throw new ApiException({ code: 'RESET_NOT_ALLOWED', message: 'สร้างลิงก์ให้บัญชีนี้ไม่ได้ ขอให้ผู้ดูแลระบบสถาบันสร้างให้' });
    }
  } else if (actor.role !== 'ADMIN') {
    throw new ApiException({ code: 'FORBIDDEN', message: 'เฉพาะหัวหน้าหรือผู้ดูแลสถาบันเท่านั้น' });
  }
  const r: Reset = { token: `rs${++seq}x${Math.random().toString(36).slice(2, 8)}`, user_id: t.id, expires_at: now() + RESET_TTL_MS, used: false, created_by: actor.id };
  resets.push(r);
  return { reset_url: `#/reset/${r.token}`, expires_at: r.expires_at };
}

export async function getReset(token: string): Promise<{ name: string }> {
  await delay();
  const r = resets.find((x) => x.token === token);
  if (!r || r.used) throw new ApiException({ code: 'NOT_FOUND', message: 'ลิงก์นี้ใช้ไม่ได้หรือถูกใช้ไปแล้ว' });
  if (r.expires_at <= now()) throw new ApiException({ code: 'RESET_EXPIRED', message: 'ลิงก์หมดอายุ ขอลิงก์ใหม่จากหัวหน้า/ผู้ดูแล' });
  return { name: userById(r.user_id).name };
}

export async function confirmReset(token: string, password: string): Promise<void> {
  await getReset(token);
  checkPassword(password);
  const r = resets.find((x) => x.token === token)!;
  setPassword(userById(r.user_id).email, password);
  r.used = true;
}

persist('account', () => ({ seq, resets }), (v) => { seq = v.seq; resets = v.resets; });
