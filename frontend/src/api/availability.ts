// mock ของ api.md §6: เวลาว่างของอาจารย์ (ครั้งเดียวต่อคนต่อภาค — D5) + รอบสอบถามเวลาว่างของหัวหน้า (ขั้น 3)
// ❓ "ไม่ว่างที่ภาควิชาอื่น" (ช่องเทาที่หัวหน้าเห็น) และการจัดอันดับวิชา (4.2) ยังไม่ทำ: รอสเปกจากอานนท์
import { notify } from './notifications';
import { getProfile } from './profiles';
import { ApiException } from './types';
import { delay } from './util';


export interface Availability {
  /** คาบที่ไม่ว่าง เก็บเป็น "วัน-คาบ" เช่น "0-3" (จันทร์ คาบ 3) */
  busy: string[];
  maxHoursPerDay: number;
  updatedAt: number;
}
export type ResponseStatus = 'submitted' | 'late' | 'filled_by_head' | 'any_time' | 'not_yet';
export interface RoundResponse { status: Exclude<ResponseStatus, 'not_yet' | 'late'>; at: number; by: string }
export interface Round {
  id: string; profile_id: string; term_id: string; teacher_ids: string[];
  deadline: number; reminders: Record<string, number>; responses: Record<string, RoundResponse>;
}
export interface BoardRow { user_id: string; status: ResponseStatus; at: number | null; reminded_at: number | null }
export interface Receipt { busy_count: number; max_hours_per_day: number; submitted_at: number; message: string }

let now = () => Date.now();
export const setAvailabilityClock = (fn: () => number) => { now = fn; };

let seq = 0;
let rounds: Round[] = [];
let avail = new Map<string, Availability>(); // `${userId}|${termId}`
export function resetMockAvailability() { seq = 0; rounds = []; avail = new Map(); now = () => Date.now(); }

const key = (u: string, t: string) => `${u}|${t}`;
export const slot = (day: number, period: number) => `${day}-${period}`;

export function statusOf(r: Round, userId: string, at = now()): ResponseStatus {
  const resp = r.responses[userId];
  if (resp) return resp.status;
  return at > r.deadline ? 'late' : 'not_yet';
}

export async function getAvailability(userId: string, termId: string): Promise<Availability | null> {
  await delay();
  const a = avail.get(key(userId, termId));
  return a ? structuredClone(a) : null;
}

function roundForTerm(termId: string, userId: string): Round | undefined {
  return rounds.find((r) => r.term_id === termId && r.teacher_ids.includes(userId));
}

/** อาจารย์บันทึก: แก้ได้จนถึงกำหนดส่ง หลังกำหนดต้องให้หัวหน้าแก้ (409 AFTER_DEADLINE) */
export async function saveAvailability(userId: string, termId: string, input: { busy: string[]; maxHoursPerDay: number }, actorIsHead = false): Promise<Availability> {
  await delay();
  if (!(input.maxHoursPerDay >= 1 && input.maxHoursPerDay <= 12)) throw new ApiException({ code: 'VALIDATION', message: 'ชั่วโมงสอนสูงสุดต่อวันต้องอยู่ระหว่าง 1–12' });
  const r = roundForTerm(termId, userId);
  if (!actorIsHead && r && r.responses[userId] && now() > r.deadline) {
    throw new ApiException({ code: 'AFTER_DEADLINE', message: 'เลยกำหนดส่งแล้ว ขอให้หัวหน้าแก้ให้' });
  }
  const a: Availability = { busy: [...new Set(input.busy)].sort(), maxHoursPerDay: input.maxHoursPerDay, updatedAt: now() };
  avail.set(key(userId, termId), a);
  return structuredClone(a);
}

export async function openRound(profileId: string, input: { teacher_ids: string[]; deadline: number }): Promise<Round> {
  await delay();
  const p = await getProfile(profileId);
  if (!input.teacher_ids.length) throw new ApiException({ code: 'VALIDATION', message: 'เลือกอาจารย์อย่างน้อย 1 คน' });
  if (input.deadline <= now()) throw new ApiException({ code: 'VALIDATION', message: 'กำหนดส่งต้องเป็นเวลาในอนาคต' });
  if (rounds.some((r) => r.profile_id === profileId)) throw new ApiException({ code: 'ROUND_EXISTS', message: 'โปรไฟล์นี้เปิดรอบแล้ว' });
  const r: Round = { id: `rd${++seq}`, profile_id: profileId, term_id: p.term_id, teacher_ids: [...input.teacher_ids], deadline: input.deadline, reminders: {}, responses: {} };
  rounds.push(r);
  r.teacher_ids.forEach((u) => notify(u, `เปิดรอบสอบถามเวลาว่างของ "${p.name}" กำหนดส่ง ${new Date(r.deadline).toLocaleDateString('th-TH')}`, 'round'));
  return structuredClone(r);
}

export async function getRound(profileId: string): Promise<{ round: Round; board: BoardRow[] } | null> {
  await delay();
  const r = rounds.find((x) => x.profile_id === profileId);
  if (!r) return null;
  const board: BoardRow[] = r.teacher_ids.map((u) => ({ user_id: u, status: statusOf(r, u), at: r.responses[u]?.at ?? null, reminded_at: r.reminders[u] ?? null }));
  return { round: structuredClone(r), board };
}

export async function remind(roundId: string, userIds?: string[]): Promise<string[]> {
  await delay();
  const r = rounds.find((x) => x.id === roundId);
  if (!r) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบรอบ' });
  const targets = (userIds ?? r.teacher_ids).filter((u) => !r.responses[u]);
  targets.forEach((u) => { r.reminders[u] = now(); notify(u, 'เตือน: ยังไม่ได้ส่งเวลาว่าง', 'reminder'); });
  return targets;
}

/** อาจารย์ส่ง: ต้องมีข้อมูลที่บันทึกไว้แล้ว คืนใบรับที่บอกว่าหัวหน้าจะเห็นอะไร */
export async function submitRound(roundId: string, userId: string): Promise<Receipt> {
  await delay();
  const r = rounds.find((x) => x.id === roundId);
  if (!r || !r.teacher_ids.includes(userId)) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบรอบนี้สำหรับคุณ' });
  const a = avail.get(key(userId, r.term_id));
  if (!a) throw new ApiException({ code: 'NOT_FILLED', message: 'ยังไม่ได้บันทึกเวลาว่าง' });
  const late = now() > r.deadline;
  if (late && r.responses[userId]) throw new ApiException({ code: 'AFTER_DEADLINE', message: 'เลยกำหนดส่งแล้ว ขอให้หัวหน้าแก้ให้' });
  const at = now();
  r.responses[userId] = { status: 'submitted', at, by: userId };
  return { busy_count: a.busy.length, max_hours_per_day: a.maxHoursPerDay, submitted_at: at, message: `ส่งแล้ว หัวหน้าเห็นว่าไม่ว่าง ${a.busy.length} คาบ และสอนได้สูงสุด ${a.maxHoursPerDay} ชม./วัน แก้ได้จนถึงกำหนดส่ง` };
}

/** หัวหน้ากรอกแทน: บันทึกว่าใครแก้ (by) หรือบันทึกว่า "ว่างทุกเวลา" */
export async function fillForTeacher(roundId: string, userId: string, headId: string, input: { any_time: true } | { busy: string[]; maxHoursPerDay: number }): Promise<void> {
  await delay();
  const r = rounds.find((x) => x.id === roundId);
  if (!r || !r.teacher_ids.includes(userId)) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบอาจารย์ในรอบนี้' });
  if ('any_time' in input) {
    avail.set(key(userId, r.term_id), { busy: [], maxHoursPerDay: 8, updatedAt: now() });
    r.responses[userId] = { status: 'any_time', at: now(), by: headId };
  } else {
    await saveAvailability(userId, r.term_id, input, true);
    r.responses[userId] = { status: 'filled_by_head', at: now(), by: headId };
  }
}

/** ขั้น 3 เสร็จเมื่อทุกอาจารย์ที่เลือกมีคำตอบ */
export const roundComplete = (r: Round) => r.teacher_ids.every((u) => Boolean(r.responses[u]));

/** รอบที่อาจารย์คนนี้ต้องตอบ (4.1 สิ่งที่ครบกำหนด) */
export async function myRounds(userId: string): Promise<{ round: Round; status: ResponseStatus; profileName: string }[]> {
  await delay();
  const out = [];
  for (const r of rounds.filter((x) => x.teacher_ids.includes(userId))) {
    const p = await getProfile(r.profile_id);
    out.push({ round: structuredClone(r), status: statusOf(r, userId), profileName: p.name });
  }
  return out;
}
