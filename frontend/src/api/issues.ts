// mock ของ api.md §6 (ขั้น 4 / 4.3): รายการ BLOCKER / WARNING ที่ระบบสร้างเอง + เธรดความเห็นเดียวกันสองฝั่ง + การตัดสินใจ
// กฎ R3: BLOCKER ต้องแก้ (ยอมรับเฉยๆ ไม่ได้) · WARNING ยอมรับพร้อมหมายเหตุได้ · ปิดด้วยการตัดสินใจที่บันทึก ใคร/เมื่อไหร่/ทำไม
// รายการจริงถูกสร้างที่ backend จากข้อมูลหลักสูตร + เวลาว่าง; mock นี้ seed ตัวอย่างให้ UI ใช้ทดสอบ
import { persist } from './persist';
import { ApiException } from './types';
import { delay } from './util';


export type Severity = 'BLOCKER' | 'WARNING';
export type Outcome = 'assign' | 'outside_teacher' | 'split' | 'accept' | 'change';
export interface IssueComment { id: string; author_id: string; author_name: string; body: string; at: number }
export interface Decision { outcome: Outcome; note: string; decided_by: string; decided_at: number }
export interface Issue {
  id: string; profile_id: string; severity: Severity; kind: string; title: string; detail: string;
  about_user_id: string | null; state: 'open' | 'closed';
  comments: IssueComment[]; decision: Decision | null;
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  assign: 'มอบหมายครูผู้สอน',
  outside_teacher: 'ใช้ครูภายนอก',
  split: 'แบ่งคาบ/แบ่งกลุ่ม',
  accept: 'ยอมรับความเสี่ยง',
  change: 'เปลี่ยนข้อมูล/เงื่อนไข',
};
/** ผลที่เลือกได้ต่อชนิดของรายการ (BLOCKER ยอมรับเฉย ๆ ไม่ได้) */
export const OUTCOMES: Record<Severity, Outcome[]> = {
  BLOCKER: ['assign', 'outside_teacher', 'split', 'change'],
  WARNING: ['accept', 'change'],
};

let now = () => Date.now();
export const setIssuesClock = (fn: () => number) => { now = fn; };
let seq = 0;
let store = new Map<string, Issue[]>();

const seed = (profileId: string): Issue[] => [
  { id: `is${++seq}`, profile_id: profileId, severity: 'BLOCKER', kind: 'NO_TEACHER', title: 'วิชา ป.31901-2005 ยังไม่มีผู้สอน', detail: 'ไม่มีครูคนใดจัดอันดับวิชานี้ไว้ และไม่มีครูที่ถูกมอบหมาย', about_user_id: null, state: 'open', comments: [], decision: null },
  { id: `is${++seq}`, profile_id: profileId, severity: 'BLOCKER', kind: 'OVER_LIMIT', title: 'ครูทดลอง ถูกมอบหมายเกินชั่วโมงสูงสุดต่อวัน', detail: 'วันพฤหัสบดีต้องสอน 8 ชม. แต่ตั้งไว้สูงสุด 6 ชม./วัน', about_user_id: 'u-teacher', state: 'open', comments: [], decision: null },
  { id: `is${++seq}`, profile_id: profileId, severity: 'WARNING', kind: 'LOW_RANK', title: 'ครูทดลอง ได้วิชาที่จัดอันดับต่ำ', detail: 'วิชา ท.31901-2004 อยู่ลำดับที่ 5 ในความต้องการของครู', about_user_id: 'u-teacher', state: 'open', comments: [], decision: null },
];

export function resetMockIssues() { seq = 0; store = new Map(); now = () => Date.now(); }

const forProfile = (profileId: string): Issue[] => {
  if (!store.has(profileId)) store.set(profileId, seed(profileId));
  return store.get(profileId)!;
};
const find = (id: string): Issue => {
  for (const list of store.values()) { const i = list.find((x) => x.id === id); if (i) return i; }
  throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบรายการ' });
};

export async function listIssues(profileId: string, f: { severity?: Severity; state?: 'open' | 'closed' } = {}): Promise<Issue[]> {
  await delay();
  return structuredClone(forProfile(profileId).filter((i) => (!f.severity || i.severity === f.severity) && (!f.state || i.state === f.state)));
}

/** รายการที่เกี่ยวกับอาจารย์คนนี้ (4.3) จากทุกโปรไฟล์ที่ระบบสร้างไว้แล้ว */
export async function myIssues(userId: string, profileIds: string[]): Promise<Issue[]> {
  await delay();
  return structuredClone(profileIds.flatMap((p) => forProfile(p)).filter((i) => i.about_user_id === userId));
}

export async function addComment(issueId: string, author: { id: string; name: string }, body: string): Promise<Issue> {
  await delay();
  const i = find(issueId);
  if (!body.trim()) throw new ApiException({ code: 'VALIDATION', message: 'พิมพ์ข้อความก่อนส่ง' });
  i.comments.push({ id: `c${++seq}`, author_id: author.id, author_name: author.name, body: body.trim(), at: now() });
  return structuredClone(i);
}

export async function decide(issueId: string, decidedBy: string, input: { outcome: Outcome; note: string }): Promise<Issue> {
  await delay();
  const i = find(issueId);
  if (i.state === 'closed') throw new ApiException({ code: 'ALREADY_DECIDED', message: 'รายการนี้ตัดสินใจไปแล้ว' });
  if (!OUTCOMES[i.severity].includes(input.outcome)) {
    throw new ApiException({ code: i.severity === 'BLOCKER' ? 'BLOCKER_NOT_ACCEPTABLE' : 'OUTCOME_NOT_ALLOWED', message: i.severity === 'BLOCKER' ? 'BLOCKER ยอมรับเฉย ๆ ไม่ได้ ต้องแก้ปัญหา' : 'ผลการตัดสินใจนี้ใช้กับรายการนี้ไม่ได้' });
  }
  if (!input.note.trim()) throw new ApiException({ code: 'VALIDATION', message: 'ใส่หมายเหตุว่าทำไมจึงตัดสินใจเช่นนี้' });
  i.decision = { outcome: input.outcome, note: input.note.trim(), decided_by: decidedBy, decided_at: now() };
  i.state = 'closed';
  return structuredClone(i);
}

/** ขั้น 4 เสร็จเมื่อไม่มีรายการค้าง ไม่งั้น 409 ISSUES_UNDECIDED พร้อมจำนวน */
export async function assertIssuesComplete(profileId: string): Promise<void> {
  await delay();
  const open = forProfile(profileId).filter((i) => i.state === 'open').length;
  if (open) throw new ApiException({ code: 'ISSUES_UNDECIDED', message: `ยังมี ${open} รายการที่ยังไม่ตัดสินใจ`, details: { open } });
}

persist('issues', () => ({ seq, store: [...store] }), (v) => { seq = v.seq; store = new Map(v.store); });
