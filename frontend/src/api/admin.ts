// mock ของ api.md §3 (ผู้ดูแลสถาบัน ADMIN): 3.1 ภาพรวม · 3.2 แผนกวิชา + หัวหน้า · 3.3 ห้องร่วม · 3.4 ปฏิทินการศึกษา
// สิทธิ์ตรวจที่นี่ด้วย (ไม่ใช่แค่ซ่อนปุ่ม): ไม่ใช่ ADMIN -> 403 FORBIDDEN (ตัวจริงตรวจที่ backend ทุก endpoint)
import { persist } from './persist';
import { allUsers } from './auth';
import {
  addDepartmentRaw, departmentName, departmentsSnapshot, removeDepartmentRaw, renameDepartmentRaw, type Department,
} from './departments';
import { createInvite, listPeople, resendInvite } from './people';
import { listProfiles } from './profiles';
import {
  addTermRaw, removeTermRaw, setHolidaysRaw, termsSnapshot, updateTermRaw, type Holiday, type TermDetail,
} from './terms';
import { ApiException } from './types';
import { delay } from './util';
import type { Role } from '../types';

function admin(actor: Role | null) {
  if (actor !== 'ADMIN') throw new ApiException({ code: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลสถาบันเท่านั้น' });
}

// ---------- 3.4 ปฏิทินการศึกษา ----------
export async function adminListTerms(actor: Role | null): Promise<TermDetail[]> { admin(actor); await delay(); return termsSnapshot(); }

export async function adminAddTerm(actor: Role | null, input: { no: number; year_ce: number; start_date: string; end_date: string }): Promise<TermDetail> {
  admin(actor); await delay();
  return addTermRaw(input);
}
export async function adminUpdateTerm(actor: Role | null, id: string, input: { start_date: string; end_date: string }): Promise<TermDetail> {
  admin(actor); await delay();
  return updateTermRaw(id, input);
}
/** ลบภาคเรียนที่มีโปรไฟล์ใช้อยู่ไม่ได้ (TERM_IN_USE) */
export async function adminDeleteTerm(actor: Role | null, id: string): Promise<void> {
  admin(actor); await delay();
  for (const d of departmentsSnapshot()) {
    if ((await listProfiles(d.id)).some((p) => p.term_id === id)) throw new ApiException({ code: 'TERM_IN_USE', message: `ลบไม่ได้: ${departmentName(d.id)} มีโปรไฟล์ที่ใช้ภาคเรียนนี้` });
  }
  removeTermRaw(id);
}
export async function adminSetHolidays(actor: Role | null, id: string, holidays: Holiday[]): Promise<TermDetail> {
  admin(actor); await delay();
  return setHolidaysRaw(id, holidays);
}

// ---------- 3.2 แผนกวิชา + หัวหน้า ----------
export interface DepartmentRow { id: string; name: string; head: { name: string; email: string } | null; head_invited: string | null; members: number }

export async function adminListDepartments(actor: Role | null): Promise<DepartmentRow[]> {
  admin(actor); await delay();
  const rows: DepartmentRow[] = [];
  for (const d of departmentsSnapshot()) {
    const people = await listPeople(d.id);
    const head = people.find((p) => p.role === 'HEAD' && p.status === 'joined');
    const pending = people.find((p) => p.role === 'HEAD' && p.status === 'invited');
    rows.push({ id: d.id, name: d.name, head: head ? { name: head.name, email: head.email } : null, head_invited: pending?.email ?? null, members: people.filter((p) => p.status === 'joined').length });
  }
  return rows;
}
export async function adminAddDepartment(actor: Role | null, name: string): Promise<Department> { admin(actor); await delay(); return addDepartmentRaw(name); }
export async function adminRenameDepartment(actor: Role | null, id: string, name: string): Promise<Department> { admin(actor); await delay(); return renameDepartmentRaw(id, name); }
/** ลบแผนกที่มีโปรไฟล์หรือสมาชิกไม่ได้ (DEPARTMENT_NOT_EMPTY) */
export async function adminDeleteDepartment(actor: Role | null, id: string): Promise<void> {
  admin(actor); await delay();
  const members = (await listPeople(id)).length;
  const profiles = (await listProfiles(id)).length;
  if (members || profiles) throw new ApiException({ code: 'DEPARTMENT_NOT_EMPTY', message: `ลบไม่ได้: มีบุคลากร/คำเชิญ ${members} รายการ และโปรไฟล์ ${profiles} รายการ` });
  removeDepartmentRaw(id);
}
/** เชิญหัวหน้า: ไม่มี SMTP จึงคืน invite_url ให้คัดลอก (D12) */
export async function adminInviteHead(actor: Role | null, depId: string, email: string): Promise<{ invite_url: string }> {
  admin(actor);
  const { invite_url } = await createInvite(depId, { email, role: 'HEAD' }, 'ADMIN');
  return { invite_url };
}
export async function adminResendHeadInvite(actor: Role | null, depId: string): Promise<{ invite_url: string }> {
  admin(actor);
  const pending = (await listPeople(depId)).find((p) => p.role === 'HEAD' && p.status === 'invited');
  if (!pending?.invite_id) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่มีคำเชิญหัวหน้าที่รออยู่' });
  return resendInvite(depId, pending.invite_id);
}
/** ถอดหัวหน้าออกจากแผนก (แผนกไม่มีหัวหน้าจนกว่าจะเชิญคนใหม่) บัญชีไม่ถูกลบ */
export async function adminRemoveHead(actor: Role | null, depId: string): Promise<void> {
  admin(actor); await delay();
  const u = allUsers().find((x) => x.memberships.some((m) => m.department_id === depId && m.role === 'HEAD'));
  if (!u) throw new ApiException({ code: 'NOT_FOUND', message: 'แผนกนี้ยังไม่มีหัวหน้า' });
  u.memberships = u.memberships.filter((m) => !(m.department_id === depId && m.role === 'HEAD'));
}

// ---------- 3.3 ห้องร่วม (department_id ว่าง) ----------
export interface SharedRoom { id: string; name: string; type: string; seats: number }
let sharedSeq = 0;
let shared: SharedRoom[] = [{ id: 'sr1', name: 'หอประชุมเล็ก', type: 'ห้องประชุม', seats: 120 }];
export function resetMockAdmin() { sharedSeq = 0; shared = [{ id: 'sr1', name: 'หอประชุมเล็ก', type: 'ห้องประชุม', seats: 120 }]; }

export async function adminListSharedRooms(actor: Role | null): Promise<SharedRoom[]> { admin(actor); await delay(); return structuredClone(shared); }
export async function adminAddSharedRoom(actor: Role | null, input: Omit<SharedRoom, 'id'>): Promise<SharedRoom> {
  admin(actor); await delay();
  const name = input.name.trim();
  if (!name || !(input.seats > 0)) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อห้องและจำนวนที่นั่ง (มากกว่า 0)' });
  if (shared.some((r) => r.name === name)) throw new ApiException({ code: 'DUPLICATE', message: 'มีห้องร่วมชื่อนี้แล้ว' });
  const r = { id: `shared-${++sharedSeq}`, name, type: input.type, seats: input.seats };
  shared.push(r);
  return structuredClone(r);
}
export async function adminRemoveSharedRoom(actor: Role | null, id: string): Promise<void> { admin(actor); await delay(); shared = shared.filter((r) => r.id !== id); }

// ---------- 3.1 ภาพรวม: แผนกไหนเผยแพร่แล้วในภาคนี้ แผนกไหนล่าช้า ----------
export type DeptProgress = 'published' | 'in_progress' | 'not_started';
export interface OverviewRow { department_id: string; name: string; has_head: boolean; progress: DeptProgress; profile_name: string | null }

export async function adminOverview(actor: Role | null, termId: string): Promise<OverviewRow[]> {
  admin(actor); await delay();
  const out: OverviewRow[] = [];
  for (const d of departmentsSnapshot()) {
    const profiles = (await listProfiles(d.id)).filter((p) => p.term_id === termId);
    const published = profiles.find((p) => p.status === 'published');
    const people = await listPeople(d.id);
    out.push({
      department_id: d.id, name: d.name, has_head: people.some((p) => p.role === 'HEAD' && p.status === 'joined'),
      progress: published ? 'published' : profiles.length ? 'in_progress' : 'not_started', profile_name: (published ?? profiles[0])?.name ?? null,
    });
  }
  return out;
}

persist('admin', () => ({ sharedSeq, shared }), (v) => { sharedSeq = v.sharedSeq; shared = v.shared; });
