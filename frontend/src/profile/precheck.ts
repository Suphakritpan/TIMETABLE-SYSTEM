// pre-check ขั้น 5 (flows F7): นับดูก่อนส่งให้ solver ว่าเป็นไปได้ไหม — ถ้าเป็นไปไม่ได้ต้องมีเหตุผล + วิธีแก้ใกล้สุด
// ตัวจริงรันที่ backend (api.md POST /profiles/{id}/prechecks) ฟังก์ชันนี้ใช้กับ mock และอธิบายกติกาให้ผู้พัฒนาฝั่ง backend ตรวจ

export interface SoftRule { key: string; label: string; enabled: boolean; weight: number }
export interface HardRule { key: string; label: string }
export interface RulesState {
  periodsPerDay: number;
  days: number;
  rooms: number;
  hard: HardRule[];
  soft: SoftRule[];
}
export interface PlanDemand { label: string; hoursPerWeek: number }

export type PrecheckResult = 'ok' | 'problems' | 'risky';
export interface PrecheckItem { severity: 'problem' | 'risk'; text: string; reason?: string; fix?: string }
export interface PrecheckReport { id: string; result: PrecheckResult; items: PrecheckItem[]; acknowledged: boolean }

export const RISKY_WEIGHT = 8;

export function runPrecheck(rules: RulesState, demands: PlanDemand[]): { result: PrecheckResult; items: PrecheckItem[] } {
  const items: PrecheckItem[] = [];
  const capacity = rules.periodsPerDay * rules.days;

  if (rules.rooms < 1) {
    items.push({ severity: 'problem', text: 'ยังไม่ได้ระบุจำนวนห้อง', reason: 'ต้องมีห้องอย่างน้อย 1 ห้องก่อนจัดตาราง', fix: 'ใส่จำนวนห้องในขั้นนี้' });
  }
  for (const d of demands) {
    if (d.hoursPerWeek > capacity) {
      items.push({
        severity: 'problem',
        text: `${d.label} ต้องการ ${d.hoursPerWeek} ชม./สัปดาห์ แต่สัปดาห์มี ${capacity} คาบ`,
        reason: `ชั่วโมงเรียนมากกว่าจำนวนคาบทั้งหมดที่จัดได้ (${rules.days} วัน × ${rules.periodsPerDay} คาบ)`,
        fix: `เพิ่มคาบต่อวันเป็นอย่างน้อย ${Math.ceil(d.hoursPerWeek / rules.days)} คาบ หรือย้ายวิชาออกจาก ${d.label}`,
      });
    }
  }
  for (const r of rules.soft) {
    if (r.enabled && r.weight >= RISKY_WEIGHT) {
      items.push({ severity: 'risk', text: `กฎ "${r.label}" น้ำหนัก ${r.weight} สูง`, reason: 'น้ำหนักสูงอาจทำให้ตัวจัดตารางลงคาบได้ไม่ครบ', fix: `ลดน้ำหนักต่ำกว่า ${RISKY_WEIGHT} หรือปิดกฎนี้` });
    }
  }

  const result: PrecheckResult = items.some((i) => i.severity === 'problem') ? 'problems' : items.length ? 'risky' : 'ok';
  return { result, items };
}
