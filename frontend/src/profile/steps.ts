// กฎแถบขั้นตอน 9 ขั้น (sitemap §กฎแถบขั้นตอน, api.md `STEP_LOCKED` / `STEP_OUT_OF_DATE`):
//  - ขั้นหนึ่งปลดล็อกเมื่อขั้นก่อนหน้าเสร็จ
//  - ย้อนไปแก้ขั้นที่เสร็จแล้ว -> ขั้นหลังจากนั้นที่เสร็จแล้วกลายเป็น "ล้าสมัย" (เฉพาะ year plan นั้น)
// ตัวจริงตัดสินที่ backend UI ใช้ฟังก์ชันนี้แสดงผล/คาดการณ์ผลกระทบก่อนยืนยัน
export const STEP_LABELS = [
  'ตั้งค่า', 'ตรวจข้อมูล', 'รอบเวลาว่าง', 'ข้อมูลอาจารย์', 'กฎ + วิชาเลือก',
  'สร้าง + จัดตาราง', 'ห้อง + อาจารย์', 'อาจารย์ตรวจทาน', 'เผยแพร่ + พิมพ์',
] as const;

/** สถานะที่เก็บ: todo ยังไม่ทำ · done เสร็จ · stale เคยเสร็จแต่ขั้นก่อนหน้าถูกแก้ภายหลัง */
export type StepStatus = 'todo' | 'done' | 'stale';
/** สถานะที่แสดง */
export type StepView = 'done' | 'current' | 'out_of_date' | 'locked';

export const initialSteps = (): StepStatus[] => STEP_LABELS.map(() => 'todo');

/** ขั้นแรกที่ยังไม่ done = จุดที่ทำต่อได้ (ถ้าเสร็จหมดคืน -1) */
export const frontier = (s: StepStatus[]): number => s.findIndex((x) => x !== 'done');

export function view(s: StepStatus[], i: number): StepView {
  if (s[i] === 'done') return 'done';
  if (s[i] === 'stale') return 'out_of_date';
  return i === frontier(s) ? 'current' : 'locked';
}

/** เปิดขั้นนี้ได้ไหม: ขั้นที่เสร็จแล้ว หรือขั้นที่ไม่เกินจุดที่ทำต่อได้ (ขั้นล้าสมัยที่อยู่หลังจุดนั้นยังเปิดไม่ได้) */
export function canOpen(s: StepStatus[], i: number): boolean {
  const f = frontier(s);
  return s[i] === 'done' || f === -1 || i <= f;
}

/** เหตุผลที่เปิดไม่ได้ (ไว้ใส่ Tooltip) หรือ null ถ้าเปิดได้ */
export function lockReason(s: StepStatus[], i: number): string | null {
  if (canOpen(s, i)) return null;
  return `ต้องทำขั้น "${STEP_LABELS[frontier(s)]}" ให้เสร็จก่อน`;
}

/** ทำขั้น i เสร็จ (ต้องเปิดได้) */
export function complete(s: StepStatus[], i: number): StepStatus[] {
  if (!canOpen(s, i)) throw new Error(`STEP_LOCKED:${i}`);
  return s.map((x, j) => (j === i ? 'done' : x));
}

/** ขั้นหลังจาก i ที่จะกลายเป็นล้าสมัยถ้าแก้ขั้น i (ใช้แสดงผลกระทบก่อนยืนยัน) */
export const impactOfEdit = (s: StepStatus[], i: number): number[] =>
  s.flatMap((x, j) => (j > i && x === 'done' ? [j] : []));

/** แก้ข้อมูลของขั้น i ที่เสร็จแล้ว: ขั้น i ยัง done แต่ขั้นหลังที่เคยเสร็จกลายเป็น stale */
export function edit(s: StepStatus[], i: number): StepStatus[] {
  if (s[i] !== 'done') throw new Error(`STEP_NOT_DONE:${i}`);
  const hit = new Set(impactOfEdit(s, i));
  return s.map((x, j) => (hit.has(j) ? 'stale' : x));
}
