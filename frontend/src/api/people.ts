// mock ของ api.md §4 (บุคลากร/ห้องของแผนก) และ §2 (คำเชิญ 0.3) — เก็บในหน่วยความจำ
// หมายเหตุ: ไม่มี SMTP ใน mock จึงคืน invite_url ให้คัดลอก (decisions D12 ข้อ 4–5) และเวลาใช้ "ชั่วโมง" แทนปฏิทินจริง
import { persist } from './persist';
import type { Membership, Role, User } from '../types';
import { departmentName } from './departments';
import { addMembership, allUsers, findUserByEmail, passwordMatches, registerUser } from './auth';
import { ApiException } from './types';
import { delay } from './util';
import { MIN_PASSWORD, PHONE_RE, USERNAME_RE } from './institution';

export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export type InviteRole = 'TEACHER' | 'ASSISTANT' | 'HEAD';
export interface Person { id: string; name: string; email: string; role: Exclude<Role, 'ADMIN'>; status: 'joined' | 'invited'; invite_id?: string }
export interface Invite {
  id: string; department_id: string; email: string; role: InviteRole;
  token: string; expires_at: number; accepted_at: number | null;
}
export interface InviteInfo { department_name: string; role: InviteRole; email: string; has_account: boolean }
export interface Room { id: string; name: string; type: string; seats: number }

let seq = 0;
let invites: Invite[] = [];
let rooms: Record<string, Room[]> = {};
let now = () => Date.now();
export const setMockClock = (fn: () => number) => { now = fn; };

export function resetMockPeople() {
  seq = 0;
  invites = [];
  rooms = { d1: [{ id: 'rm1', name: 'COM602', type: 'ห้องปฏิบัติการ', seats: 30 }, { id: 'rm2', name: '621', type: 'ห้องเรียน', seats: 40 }], d2: [] };
  now = () => Date.now();
}
resetMockPeople();

const token = () => `tk${++seq}x${Math.random().toString(36).slice(2, 8)}`;

export async function listPeople(dep: string): Promise<Person[]> {
  await delay();
  const joined: Person[] = allUsers().flatMap((u) =>
    u.memberships.filter((m) => m.department_id === dep).map((m) => ({ id: u.id, name: u.name, email: u.email, role: m.role, status: 'joined' as const })),
  );
  const pending: Person[] = invites
    .filter((i) => i.department_id === dep && !i.accepted_at)
    .map((i) => ({ id: i.id, name: i.email, email: i.email, role: i.role, status: 'invited' as const, invite_id: i.id }));
  return structuredClone([...joined, ...pending]);
}

/** เชิญได้เฉพาะ TEACHER/ASSISTANT: ผู้ช่วยเชิญอาจารย์ได้ แต่เชิญผู้ช่วยได้เฉพาะหัวหน้า (D12) */
export async function createInvite(dep: string, input: { email: string; role: InviteRole }, actor: Role): Promise<{ invite: Invite; invite_url: string }> {
  await delay();
  // หัวหน้าแผนกเชิญได้โดยผู้ดูแลสถาบันเท่านั้น (3.2) และผู้ดูแลเชิญได้เฉพาะหัวหน้า
  if (input.role === 'HEAD') {
    if (actor !== 'ADMIN') throw new ApiException({ code: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลสถาบันเท่านั้นที่เชิญหัวหน้าได้' });
  } else if (actor !== 'HEAD' && actor !== 'ASSISTANT') {
    throw new ApiException({ code: 'FORBIDDEN', message: 'บทบาทของคุณเชิญไม่ได้' });
  }
  if (input.role === 'HEAD' && (allUsers().some((u) => u.memberships.some((m) => m.department_id === dep && m.role === 'HEAD')) || invites.some((i) => i.department_id === dep && i.role === 'HEAD' && !i.accepted_at))) {
    throw new ApiException({ code: 'HEAD_EXISTS', message: 'แผนกนี้มีหัวหน้าหรือคำเชิญหัวหน้าอยู่แล้ว' });
  }
  if (input.role === 'ASSISTANT' && actor !== 'HEAD') throw new ApiException({ code: 'HEAD_ONLY', message: 'เฉพาะหัวหน้าเท่านั้นที่เชิญผู้ช่วยได้' });
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiException({ code: 'VALIDATION', message: 'อีเมลไม่ถูกต้อง' });
  const existing = findUserByEmail(email);
  if (existing?.memberships.some((m) => m.department_id === dep)) throw new ApiException({ code: 'ALREADY_MEMBER', message: 'บุคคลนี้อยู่ในแผนกแล้ว' });
  if (invites.some((i) => i.department_id === dep && i.email === email && !i.accepted_at)) throw new ApiException({ code: 'ALREADY_INVITED', message: 'เชิญอีเมลนี้ไปแล้ว ใช้ "ส่งใหม่" แทน' });
  const invite: Invite = { id: `inv${++seq}`, department_id: dep, email, role: input.role, token: token(), expires_at: now() + INVITE_TTL_MS, accepted_at: null };
  invites.push(invite);
  return { invite: structuredClone(invite), invite_url: `#/invite/${invite.token}` };
}

/** ส่งใหม่: ออกโทเค็นใหม่ ลิงก์เก่าใช้ไม่ได้ */
export async function resendInvite(dep: string, inviteId: string): Promise<{ invite_url: string }> {
  await delay();
  const i = invites.find((x) => x.id === inviteId && x.department_id === dep && !x.accepted_at);
  if (!i) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบคำเชิญ' });
  i.token = token();
  i.expires_at = now() + INVITE_TTL_MS;
  return { invite_url: `#/invite/${i.token}` };
}

/** ลบคนออกจากแผนก (เฉพาะหัวหน้า) ลบหัวหน้าไม่ได้ · ถ้าเป็นคำเชิญที่ยังไม่รับ = ยกเลิกคำเชิญ */
export async function removePerson(dep: string, p: Pick<Person, 'id' | 'status'>, actor: Role): Promise<void> {
  await delay();
  if (actor !== 'HEAD') throw new ApiException({ code: 'HEAD_ONLY', message: 'เฉพาะหัวหน้าเท่านั้นที่ลบบุคลากรได้' });
  if (p.status === 'invited') {
    invites = invites.filter((i) => i.id !== p.id);
    return;
  }
  const u = allUsers().find((x) => x.id === p.id);
  const m = u?.memberships.find((x) => x.department_id === dep);
  if (!u || !m) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบบุคลากร' });
  if (m.role === 'HEAD') throw new ApiException({ code: 'CANNOT_REMOVE_HEAD', message: 'ลบหัวหน้าไม่ได้' });
  u.memberships = u.memberships.filter((x) => x.department_id !== dep);
}

// ---------- ห้องของแผนก ----------
export async function listRooms(dep: string): Promise<Room[]> { await delay(); return structuredClone(rooms[dep] ?? []); }

export async function addRoom(dep: string, input: Omit<Room, 'id'>): Promise<Room> {
  await delay();
  const name = input.name.trim();
  if (!name || !(input.seats > 0)) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อห้องและจำนวนที่นั่ง (มากกว่า 0)' });
  if ((rooms[dep] ?? []).some((r) => r.name === name)) throw new ApiException({ code: 'DUPLICATE', message: 'มีห้องชื่อนี้แล้ว' });
  const r: Room = { id: `room-${++seq}`, name, type: input.type, seats: input.seats };
  rooms[dep] = [...(rooms[dep] ?? []), r];
  return structuredClone(r);
}

export async function removeRoom(dep: string, id: string): Promise<void> {
  await delay();
  rooms[dep] = (rooms[dep] ?? []).filter((r) => r.id !== id);
}

// ---------- 0.3 รับคำเชิญ ----------
function findInvite(tk: string): Invite {
  const i = invites.find((x) => x.token === tk);
  if (!i || i.accepted_at) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบคำเชิญนี้ หรือถูกใช้ไปแล้ว' });
  if (i.expires_at <= now()) throw new ApiException({ code: 'INVITE_EXPIRED', message: 'ลิงก์เชิญหมดอายุ ขอให้หัวหน้า/ผู้ดูแลส่งใหม่' });
  return i;
}

export async function getInvite(tk: string): Promise<InviteInfo> {
  await delay();
  const i = findInvite(tk);
  return { department_name: departmentName(i.department_id), role: i.role, email: i.email, has_account: Boolean(findUserByEmail(i.email)) };
}

/** ผู้ใช้ใหม่: ส่งชื่อ+รหัสผ่านสร้างบัญชี · ผู้ใช้เดิม: ส่งรหัสผ่านของบัญชีเดิมเพื่อเพิ่มแผนก (ลิงก์หมดอายุ -> ไม่สร้างบัญชี) */
export interface AcceptInput { name?: string; first_name?: string; last_name?: string; username?: string; phone?: string; avatar?: string; language?: 'th' | 'en'; password: string }

export async function acceptInvite(tk: string, input: AcceptInput): Promise<User> {
  await delay();
  const i = findInvite(tk);
  const membership: Membership = { department_id: i.department_id, department_name: departmentName(i.department_id), role: i.role };
  const existing = findUserByEmail(i.email);
  let user: User;
  if (existing) {
    if (!passwordMatches(i.email, input.password)) throw new ApiException({ code: 'INVALID_CREDENTIALS', message: 'รหัสผ่านของบัญชีเดิมไม่ถูกต้อง' });
    addMembership(existing, membership);
    user = existing;
  } else {
    const first = input.first_name?.trim() ?? '';
    const last = input.last_name?.trim() ?? '';
    const name = input.name?.trim() || `${first} ${last}`.trim();
    if (!name) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อ' });
    if (input.password.length < MIN_PASSWORD) throw new ApiException({ code: 'VALIDATION', message: `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` });
    const username = input.username?.trim();
    if (username && !USERNAME_RE.test(username)) throw new ApiException({ code: 'VALIDATION', message: 'ชื่อผู้ใช้ 3–30 ตัว ใช้ a-z 0-9 . _ - เท่านั้น' });
    if (username && allUsers().some((u) => u.username?.toLowerCase() === username.toLowerCase())) throw new ApiException({ code: 'DUPLICATE_USERNAME', message: 'มีบัญชีใช้ชื่อผู้ใช้นี้แล้ว' });
    const phone = input.phone?.trim();
    if (phone && !PHONE_RE.test(phone)) throw new ApiException({ code: 'VALIDATION', message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' });
    user = {
      id: `u-${i.id}`, name, email: i.email, language: input.language ?? 'th', is_admin: false, memberships: [membership],
      username: username || undefined, first_name: first || undefined, last_name: last || undefined, phone: phone || undefined, avatar: input.avatar,
      created_at: new Date().toISOString(), status: 'active', email_verified: false,
    };
    registerUser(user, input.password);
  }
  i.accepted_at = now();
  return structuredClone(user);
}

persist('people', () => ({ seq, invites, rooms }), (v) => { seq = v.seq; invites = v.invites; rooms = v.rooms; });
