// ปฏิทินการศึกษา (3.4): ต้นทางของภาคเรียนทั้งระบบ — ห้ามเอาวันที่ภาคเรียนจาก PDF หลักสูตร (sitemap 3.4)
// store ของ mock: profiles.ts อ่านจากที่นี่ (TERM_NOT_IN_CALENDAR) และ admin.ts แก้ไขที่นี่
import { persist } from './persist';
import type { Term } from '../types';
import { ApiException } from './types';

export interface Holiday { day: string; name: string }
export interface TermDetail extends Term { start_date: string; end_date: string; holidays: Holiday[] }

const SEED: TermDetail[] = [
  { id: 't-2-2569', no: 2, year_ce: 2026, start_date: '2026-11-02', end_date: '2027-03-12', holidays: [{ day: '2026-12-10', name: 'วันรัฐธรรมนูญ' }] },
  { id: 't-1-2570', no: 1, year_ce: 2027, start_date: '2027-05-17', end_date: '2027-09-24', holidays: [] },
  { id: 't-2-2570', no: 2, year_ce: 2027, start_date: '2027-11-01', end_date: '2028-03-10', holidays: [] },
];
let terms: TermDetail[] = structuredClone(SEED);
export function resetMockTerms() { terms = structuredClone(SEED); }

export const termsSnapshot = (): TermDetail[] => structuredClone(terms);
export const termExists = (id: string) => terms.some((t) => t.id === id);

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const termId = (no: number, year: number) => `t-${no}-${year + 543}`;

function validate(input: { no: number; year_ce: number; start_date: string; end_date: string }, ignoreId?: string) {
  if (![1, 2, 3].includes(input.no)) throw new ApiException({ code: 'VALIDATION', message: 'ภาคเรียนต้องเป็น 1, 2 หรือ 3' });
  if (!isDate(input.start_date) || !isDate(input.end_date)) throw new ApiException({ code: 'VALIDATION', message: 'วันที่ไม่ถูกต้อง' });
  if (input.start_date >= input.end_date) throw new ApiException({ code: 'VALIDATION', message: 'วันเริ่มต้องก่อนวันสิ้นสุด' });
  const others = terms.filter((t) => t.id !== ignoreId);
  if (others.some((t) => t.id === termId(input.no, input.year_ce))) throw new ApiException({ code: 'DUPLICATE', message: 'มีภาคเรียนนี้ในปฏิทินแล้ว' });
  const clash = others.find((t) => input.start_date <= t.end_date && t.start_date <= input.end_date);
  if (clash) throw new ApiException({ code: 'TERM_OVERLAP', message: `ช่วงวันที่ทับกับภาค ${clash.no}/${clash.year_ce + 543}` });
}

export function addTermRaw(input: { no: number; year_ce: number; start_date: string; end_date: string }): TermDetail {
  validate(input);
  const t: TermDetail = { id: termId(input.no, input.year_ce), ...input, holidays: [] };
  terms.push(t);
  terms.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return structuredClone(t);
}

export function updateTermRaw(id: string, input: { start_date: string; end_date: string }): TermDetail {
  const t = terms.find((x) => x.id === id);
  if (!t) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบภาคเรียน' });
  validate({ no: t.no, year_ce: t.year_ce, ...input }, id);
  const outside = t.holidays.filter((h) => h.day < input.start_date || h.day > input.end_date);
  if (outside.length) throw new ApiException({ code: 'HOLIDAY_OUTSIDE', message: `ช่วงใหม่ไม่ครอบคลุมวันหยุด: ${outside.map((h) => h.name).join(', ')}` });
  Object.assign(t, input);
  return structuredClone(t);
}

export function removeTermRaw(id: string) {
  terms = terms.filter((t) => t.id !== id);
}

/** แทนทั้งรายการ (api.md PUT …/holidays ส่งทั้งรายการ): วันหยุดต้องอยู่ในช่วงภาคเรียน ไม่ซ้ำวัน */
export function setHolidaysRaw(id: string, holidays: Holiday[]): TermDetail {
  const t = terms.find((x) => x.id === id);
  if (!t) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบภาคเรียน' });
  for (const h of holidays) {
    if (!isDate(h.day) || !h.name.trim()) throw new ApiException({ code: 'VALIDATION', message: 'วันหยุดต้องมีวันที่และชื่อ' });
    if (h.day < t.start_date || h.day > t.end_date) throw new ApiException({ code: 'HOLIDAY_OUTSIDE', message: `${h.name} อยู่นอกช่วงภาคเรียน` });
  }
  if (new Set(holidays.map((h) => h.day)).size !== holidays.length) throw new ApiException({ code: 'DUPLICATE', message: 'มีวันหยุดซ้ำวัน' });
  t.holidays = holidays.map((h) => ({ day: h.day, name: h.name.trim() })).sort((a, b) => a.day.localeCompare(b.day));
  return structuredClone(t);
}

persist('terms', () => terms, (v) => { terms = v; });
