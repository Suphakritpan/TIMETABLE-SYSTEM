// mock ของ api.md §7: rules, prechecks, acknowledge, และตัวกัน Generate (409 PRECHECK_NOT_ACKNOWLEDGED)
import { runPrecheck, type PrecheckReport, type RulesState } from '../profile/precheck';
import { getProfile } from './profiles';
import { ApiException } from './types';
import { delay } from './util';


const DEFAULT_RULES: RulesState = {
  periodsPerDay: 6, days: 5, rooms: 4,
  hard: [
    { key: 'lab', label: 'วิชาปฏิบัติต้องใช้ห้องปฏิบัติการ' },
    { key: 'consecutive', label: 'วิชาที่กำหนดคาบต่อเนื่องต้องอยู่ติดกัน' },
  ],
  soft: [
    { key: 'no_gaps', label: 'ลดคาบว่างระหว่างวันของกลุ่มเรียน', enabled: true, weight: 5 },
    { key: 'spread', label: 'กระจายวิชาเดียวกันไม่ให้ซ้ำวันเดียวกัน', enabled: true, weight: 3 },
    { key: 'teacher_max', label: 'ไม่เกินชั่วโมงสอนสูงสุดต่อวันของครู', enabled: true, weight: 6 },
  ],
};

// ชั่วโมงเรียนต่อสัปดาห์ของแต่ละชั้นปี (mock: ปี 2 = 38 ตามตัวอย่างใน flows F7)
const HOURS: Record<number, number> = { 1: 26, 2: 38 };

const rulesByProfile = new Map<string, RulesState>();
const reports = new Map<string, PrecheckReport>(); // profileId -> รายงานล่าสุด
let seq = 0;

export function resetMockRules() { rulesByProfile.clear(); reports.clear(); seq = 0; }

export async function getRules(profileId: string): Promise<RulesState> {
  await delay();
  return structuredClone(rulesByProfile.get(profileId) ?? DEFAULT_RULES);
}

/** แก้กฎแล้วรายงาน pre-check และการรับทราบเดิมใช้ไม่ได้ ต้อง Check ใหม่ (R4) */
export async function putRules(profileId: string, rules: RulesState): Promise<RulesState> {
  await delay();
  rulesByProfile.set(profileId, structuredClone(rules));
  reports.delete(profileId);
  return structuredClone(rules);
}

export async function runCheck(profileId: string): Promise<PrecheckReport> {
  const [p, rules] = await Promise.all([getProfile(profileId), getRules(profileId)]);
  const demands = p.year_plans.map((y) => ({ label: `${y.program} ปี ${y.year}`, hoursPerWeek: HOURS[y.year] ?? 30 }));
  const { result, items } = runPrecheck(rules, demands);
  const report: PrecheckReport = { id: `pc${++seq}`, result, items, acknowledged: false };
  reports.set(profileId, report);
  return structuredClone(report);
}

export async function getReport(profileId: string): Promise<PrecheckReport | null> {
  await delay();
  const r = reports.get(profileId);
  return r ? structuredClone(r) : null;
}

export async function acknowledge(profileId: string, reportId: string): Promise<PrecheckReport> {
  await delay();
  const r = reports.get(profileId);
  if (!r || r.id !== reportId) throw new ApiException({ code: 'PRECHECK_STALE', message: 'รายงานนี้ล้าสมัยแล้ว (แก้กฎหลังตรวจ) กรุณา Check ใหม่' });
  if (r.result === 'problems') throw new ApiException({ code: 'PRECHECK_IMPOSSIBLE', message: 'ยังมีปัญหาที่ทำให้จัดตารางไม่ได้ แก้กฎก่อนแล้ว Check ใหม่' });
  r.acknowledged = true;
  return structuredClone(r);
}

/** ตัวกัน Generate: ต้องมีรายงานที่รับทราบแล้ว (บันทึกกับการรัน) */
export function assertAcknowledged(profileId: string) {
  if (!reports.get(profileId)?.acknowledged) {
    throw new ApiException({ code: 'PRECHECK_NOT_ACKNOWLEDGED', message: 'ต้องรับทราบรายงาน pre-check ก่อนสร้างตาราง' });
  }
}
