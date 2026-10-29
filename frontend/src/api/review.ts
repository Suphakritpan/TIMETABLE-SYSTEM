// mock ของ api.md §8–9 (ขั้น 8 / 4.4 / 4.5): คำขอเปลี่ยนจากอาจารย์, direct edit ของหัวหน้า (ตกลงกับ ___), การแจ้งเตือน
// หลักการ (flows F9, D8): ใน REVIEW อาจารย์เห็นเฉพาะคาบตัวเอง · ขอเปลี่ยนต้องมีเหตุผล · หัวหน้าเห็นผลกระทบก่อนอนุมัติ ·
// ปฏิเสธต้องมีหมายเหตุ · direct edit ต้องระบุ "ตกลงกับใคร" และต้องไม่ชน · อาจารย์ที่ได้รับผลกระทบถูกแจ้ง เก่า → ใหม่
import { persist } from './persist';
import { findClashes } from '../profile/clashes';
import type { ClassItem, User } from '../types';
import { allUsers } from './auth';
import { listNotifications as listNotes, notify, resetMockNotifications, type Notification } from './notifications';
import { profileStatusSync } from './profiles';
import { loadLastRun, saveLastRun } from './runs';
import { ApiException } from './types';
import { delay } from './util';


export interface ChangeRequest {
  id: string; profile_id: string; class_id: string; requested_by: string; reason: string; impact: string;
  status: 'waiting' | 'approved' | 'rejected'; decision_note: string; decided_by: string | null; created_at: number;
}
export interface ChangeLogEntry {
  id: string; profile_id: string; changed_by: string; request_id: string | null; agreed_with: string | null;
  old_value: { day: number; start: number }; new_value: { day: number; start: number }; class_code: string; at: number;
}

const now = () => Date.now();
let seq = 0;
let requests: ChangeRequest[] = [];
let log: ChangeLogEntry[] = [];
export function resetMockReview() { seq = 0; requests = []; log = []; resetMockNotifications(); }

/** คาบนี้เป็นของอาจารย์คนนี้ไหม (mock: ชื่อสั้นในตารางตัวอย่างอยู่ในชื่อเต็มของบัญชี; API จริงใช้ teacher_ids) */
export const isMine = (user: Pick<User, 'name'>, item: Pick<ClassItem, 'teacher'>) => item.teacher.split(' + ').some((t) => t.trim() && user.name.includes(t.trim()));
const usersFor = (item: ClassItem): User[] => allUsers().filter((u) => isMine(u, item));


/** ผลกระทบของการย้ายคาบ: นับคาบอื่นวันเดียวกันที่ใช้ครูหรือห้องเดียวกัน (ต้องขยับตาม) */
export function impactFor(placed: ClassItem[], classId: string): string {
  const c = placed.find((p) => p.id === classId);
  if (!c) return 'ไม่ทราบผลกระทบ';
  const sameDay = placed.filter((p) => p.id !== classId && p.day === c.day && (p.room === c.room || p.teacher.split(' + ').some((t) => c.teacher.split(' + ').includes(t))));
  return sameDay.length ? `ต้องขยับอีก ${sameDay.length} คาบ (${sameDay.map((p) => p.code).join(', ')})` : 'ไม่กระทบคาบอื่น';
}

export async function createRequest(profileId: string, user: User, input: { class_id: string; reason: string }): Promise<ChangeRequest> {
  await delay();
  const status = profileStatusSync(profileId);
  if (status !== 'review') throw new ApiException({ code: 'NOT_IN_REVIEW', message: status === 'published' ? 'เผยแพร่แล้ว ต้องให้หัวหน้าเริ่มการเปลี่ยนแปลง' : 'ยังไม่ถึงขั้นตรวจทาน' });
  const placed = loadLastRun(profileId)?.placed ?? [];
  const c = placed.find((p) => p.id === input.class_id);
  if (!c || !isMine(user, c)) throw new ApiException({ code: 'FORBIDDEN', message: 'ขอเปลี่ยนได้เฉพาะคาบของตัวเอง' });
  if (!input.reason.trim()) throw new ApiException({ code: 'VALIDATION', message: 'ใส่เหตุผลที่ขอเปลี่ยน' });
  if (requests.some((r) => r.profile_id === profileId && r.class_id === input.class_id && r.requested_by === user.id && r.status === 'waiting')) {
    throw new ApiException({ code: 'ALREADY_REQUESTED', message: 'มีคำขอของคาบนี้รออยู่แล้ว' });
  }
  const r: ChangeRequest = { id: `rq${++seq}`, profile_id: profileId, class_id: input.class_id, requested_by: user.id, reason: input.reason.trim(), impact: impactFor(placed, input.class_id), status: 'waiting', decision_note: '', decided_by: null, created_at: now() };
  requests.push(r);
  return structuredClone(r);
}

export async function listRequests(profileId: string): Promise<ChangeRequest[]> { await delay(); return structuredClone(requests.filter((r) => r.profile_id === profileId)); }
export async function myRequests(userId: string): Promise<ChangeRequest[]> { await delay(); return structuredClone(requests.filter((r) => r.requested_by === userId)); }

export async function decideRequest(id: string, headId: string, input: { approve: boolean; note: string }): Promise<ChangeRequest> {
  await delay();
  const r = requests.find((x) => x.id === id);
  if (!r) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบคำขอ' });
  if (r.status !== 'waiting') throw new ApiException({ code: 'ALREADY_DECIDED', message: 'คำขอนี้ตัดสินแล้ว' });
  if (!input.approve && !input.note.trim()) throw new ApiException({ code: 'VALIDATION', message: 'ปฏิเสธต้องใส่หมายเหตุ' });
  r.status = input.approve ? 'approved' : 'rejected';
  r.decision_note = input.note.trim();
  r.decided_by = headId;
  notify(r.requested_by, input.approve ? `คำขอเปลี่ยนของคุณได้รับอนุมัติ${r.decision_note ? `: ${r.decision_note}` : ''}` : `คำขอเปลี่ยนของคุณถูกปฏิเสธ: ${r.decision_note}`);
  return structuredClone(r);
}

/** direct edit: ย้ายคาบเอง ต้องระบุ "ตกลงกับ ___" และห้ามชน; แจ้งอาจารย์ที่ได้รับผลกระทบพร้อมค่าเก่า → ใหม่ */
export async function directEdit(profileId: string, head: Pick<User, 'id' | 'name'>, classId: string, to: { day: number; start: number }, agreedWith: string): Promise<ChangeLogEntry> {
  await delay();
  const status = profileStatusSync(profileId);
  if (status === 'published') throw new ApiException({ code: 'VERSION_LOCKED', message: 'เผยแพร่แล้ว แก้ตรง ๆ ไม่ได้ ต้องเริ่มการเปลี่ยนแปลง' });
  if (!agreedWith.trim()) throw new ApiException({ code: 'VALIDATION', message: 'ระบุว่าตกลงกับใคร' });
  const run = loadLastRun(profileId);
  const c = run?.placed.find((p) => p.id === classId);
  if (!run || !c) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบคาบ' });
  const moved = { ...c, day: to.day, start: to.start };
  const next = { ...run, placed: run.placed.map((p) => (p.id === classId ? moved : p)) };
  const clash = findClashes(next.placed).get(classId);
  if (clash) throw new ApiException({ code: 'CLASH', message: `ย้ายไม่ได้: ${clash.join(' · ')}` });
  saveLastRun(profileId, next);
  const entry: ChangeLogEntry = { id: `cl${++seq}`, profile_id: profileId, changed_by: head.id, request_id: null, agreed_with: agreedWith.trim(), old_value: { day: c.day, start: c.start }, new_value: to, class_code: c.code, at: now() };
  log.push(entry);
  usersFor(c).forEach((u) => notify(u.id, `แก้โดย ${head.name}: ย้าย ${c.code} (ตกลงกับ ${entry.agreed_with})`));
  return structuredClone(entry);
}

export async function listLog(profileId: string): Promise<ChangeLogEntry[]> { await delay(); return structuredClone(log.filter((l) => l.profile_id === profileId)); }
export type { Notification };
export const listNotifications = listNotes;

persist('review', () => ({ seq, requests, log }), (v) => { seq = v.seq; requests = v.requests; log = v.log; });
