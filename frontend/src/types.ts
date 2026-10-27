// ชนิดข้อมูลโดเมนฝั่ง UI (รูปที่ UI ใช้) ส่วนรูปจาก API อยู่ที่ api/types.ts และต้องผ่านตัวแปลงก่อนเข้า UI
export type Role = 'ADMIN' | 'HEAD' | 'ASSISTANT' | 'TEACHER';
export type InstitutionType = 'vocational' | 'university';

/** สถานะเซลล์ตาราง (design-system §5.2) ทุกสถานะต้องมีสี + สัญลักษณ์ + ข้อความ */
export type CellStatus = 'ok' | 'review' | 'conflict' | 'confirmed' | 'edited' | 'unplaced' | 'pinned';

export interface ClassItem {
  id: string;
  day: number; // 0 = จันทร์
  start: number; // คาบเริ่ม (นับจาก 1)
  span: number;
  code: string;
  name: string;
  room: string;
  teacher: string;
  status: CellStatus;
  conf?: number; // ความมั่นใจ OCR 0-100
  /** กลุ่มเรียน (ใช้ที่หน้านักเรียนสาธารณะ) ❓ ใน API จริงมาจาก group_id */
  group?: string;
}

export interface UnplacedItem {
  id: string;
  code: string;
  name: string;
  span: number;
  reason: string;
  fix: string;
}

export interface Period { no: number; time: string }

export interface Membership { department_id: string; department_name: string; role: Exclude<Role, 'ADMIN'> }
export interface User {
  id: string;
  name: string;
  email: string;
  language: 'th' | 'en';
  is_admin: boolean;
  memberships: Membership[];
}

export type ProfileStatus = 'draft' | 'review' | 'published';
export interface Term { id: string; no: number; year_ce: number }
export interface YearPlan {
  id: string;
  program: string; // ปวช. | ปวส. (ข้อมูลจริงมาจาก PROGRAM)
  year: number;
  steps: import('./profile/steps').StepStatus[];
}
export interface Profile {
  id: string;
  department_id: string;
  name: string;
  term_id: string;
  status: ProfileStatus;
  year_plans: YearPlan[];
  /** เวอร์ชันของโปรไฟล์เดียวกัน (family_id เดียวกัน) เริ่มที่ 1; การเปลี่ยนแปลงหลังเผยแพร่สร้างเวอร์ชันใหม่เสมอ (D8) */
  version_no: number;
  family_id: string;
  published_at: number | null;
}
