// ขั้น 1 ตั้งค่าเวลาเรียน (ต่อ หลักสูตร × ชั้นปี) และขั้น 2 ตรวจความพร้อมของข้อมูล (mock)
import { persist } from './persist';
import { listPeople, listRooms } from './people';
import { termExists } from './terms';
import type { Profile } from '../types';
import { ApiException } from './types';
import { delay } from './util';

export type Cell = 'teach' | 'break' | 'off';
/** grid: คีย์ `${วัน 0=จันทร์}:${คาบ 1..}` -> สถานะช่อง (ไม่มีคีย์ = off) */
export interface TimeSettings { periods: number; start: string; minutes: number; grid: Record<string, Cell> }
export const SCHOOL_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const cellKey = (day: number, period: number) => `${day}:${period}`;

/** ค่าตั้งต้น: จันทร์–ศุกร์สอนทุกคาบ คาบ 5 พัก เสาร์หยุด */
export function defaultSettings(): TimeSettings {
  const grid: Record<string, Cell> = {};
  for (let d = 0; d < 5; d++) for (let p = 1; p <= 10; p++) grid[cellKey(d, p)] = p === 5 ? 'break' : 'teach';
  return { periods: 10, start: '08:00', minutes: 60, grid };
}
export const teachDays = (s: TimeSettings): number =>
  SCHOOL_DAYS.filter((_, d) => Array.from({ length: s.periods }, (_, i) => s.grid[cellKey(d, i + 1)]).includes('teach')).length;

let store: Record<string, TimeSettings> = {};
export function resetMockSetup() { store = {}; }
persist('setup', () => store, (v) => { store = v; });

export async function getSettings(yearPlanId: string): Promise<TimeSettings | null> {
  await delay();
  const s = store[yearPlanId];
  return s?.grid ? structuredClone(s) : null; // ข้อมูลรูปแบบเก่า (ไม่มี grid) ถือว่ายังไม่ตั้งค่า
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function saveSettings(yearPlanId: string, s: TimeSettings): Promise<TimeSettings> {
  await delay();
  if (!HHMM.test(s.start)) throw new ApiException({ code: 'VALIDATION', message: 'เวลาเริ่มไม่ถูกต้อง (ชั่วโมง:นาที)' });
  if (!Number.isInteger(s.periods) || s.periods < 1 || s.periods > 12) throw new ApiException({ code: 'VALIDATION', message: 'จำนวนคาบต่อวันต้องอยู่ระหว่าง 1–12' });
  if (!Number.isInteger(s.minutes) || s.minutes < 30 || s.minutes > 120) throw new ApiException({ code: 'VALIDATION', message: 'ความยาวคาบต้องอยู่ระหว่าง 30–120 นาที' });
  if (teachDays(s) === 0) throw new ApiException({ code: 'VALIDATION', message: 'ต้องมีอย่างน้อย 1 คาบที่สอนได้' });
  store[yearPlanId] = structuredClone(s);
  return structuredClone(s);
}

/** เวลาเริ่ม–จบของแต่ละคาบ (คาบต่อกันไม่เว้น คาบพักก็กินเวลาตามความยาวคาบ) */
export function periodTimes(s: Pick<TimeSettings, 'periods' | 'start' | 'minutes'>): { no: number; from: string; to: string }[] {
  const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const t0 = Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3));
  return Array.from({ length: s.periods }, (_, i) => ({ no: i + 1, from: hm(t0 + i * s.minutes), to: hm(t0 + (i + 1) * s.minutes) }));
}

export interface Check { id: string; label: string; level: 'ok' | 'warn' | 'block'; detail: string }

/** ขั้น 2: ตรวจว่าข้อมูลพอจัดตารางได้ block = ต้องแก้ก่อนไปต่อ, warn = ไปต่อได้แต่ควรรู้ */
export async function checkReadiness(profile: Profile, yearPlanId: string): Promise<Check[]> {
  const [people, rooms, settings] = await Promise.all([listPeople(profile.department_id), listRooms(profile.department_id), getSettings(yearPlanId)]);
  const yp = profile.year_plans.find((y) => y.id === yearPlanId);
  const joined = people.filter((p) => p.role === 'TEACHER' && p.status === 'joined').length;
  const invited = people.filter((p) => p.status === 'invited').length;
  const out: Check[] = [
    termExists(profile.term_id)
      ? { id: 'term', label: 'ภาคเรียนอยู่ในปฏิทินการศึกษา', level: 'ok', detail: 'พบภาคเรียนในปฏิทิน' }
      : { id: 'term', label: 'ภาคเรียนอยู่ในปฏิทินการศึกษา', level: 'block', detail: 'ไม่พบภาคเรียนนี้ในปฏิทิน ให้ผู้ดูแลสถาบันเพิ่มก่อน' },
    settings || yp?.steps[0] === 'done'
      ? { id: 'setup', label: 'ตั้งค่าเวลาเรียนแล้ว', level: 'ok', detail: settings ? `${settings.periods} คาบ/วัน · สอน ${teachDays(settings)} วัน` : 'ขั้น 1 เสร็จแล้ว' }
      : { id: 'setup', label: 'ตั้งค่าเวลาเรียนแล้ว', level: 'block', detail: 'กลับไปทำขั้น 1 ก่อน' },
    joined > 0
      ? { id: 'teacher', label: 'มีอาจารย์ในแผนก', level: 'ok', detail: `${joined} คนที่เข้าร่วมแล้ว` }
      : { id: 'teacher', label: 'มีอาจารย์ในแผนก', level: 'block', detail: 'ยังไม่มีอาจารย์ที่ตอบรับคำเชิญ ไปหน้า “บุคลากรและห้อง”' },
    rooms.length > 0
      ? { id: 'room', label: 'มีห้องเรียน', level: 'ok', detail: `${rooms.length} ห้อง` }
      : { id: 'room', label: 'มีห้องเรียน', level: 'block', detail: 'ยังไม่มีห้อง ไปหน้า “บุคลากรและห้อง”' },
    people.some((p) => p.role === 'HEAD')
      ? { id: 'head', label: 'มีหัวหน้าแผนก', level: 'ok', detail: 'มีหัวหน้าแล้ว' }
      : { id: 'head', label: 'มีหัวหน้าแผนก', level: 'warn', detail: 'ยังไม่มีหัวหน้า (เผยแพร่ตารางไม่ได้จนกว่าจะมี)' },
  ];
  if (invited) out.push({ id: 'invited', label: 'คำเชิญที่ยังไม่ตอบรับ', level: 'warn', detail: `${invited} คน ยังไม่ถูกนับเป็นอาจารย์ในรอบเวลาว่าง` });
  return out;
}
