import type { Profile, Role } from '../../types';

/** ข้อมูลที่ทุกขั้นได้รับจากพื้นที่ทำงาน (2.4) */
export interface StepProps {
  profile: Profile;
  yearPlanId: string;
  /** ขั้นนี้เสร็จแล้ว */
  done: boolean;
  /** เวอร์ชันถูกเผยแพร่และล็อก: แก้ไม่ได้ */
  locked: boolean;
  role: Role | null;
  /** ทำขั้นนี้เสร็จ (เรียก PUT ผ่านพื้นที่ทำงาน) */
  onComplete: () => Promise<void>;
  /** โปรไฟล์เปลี่ยน (เช่น เผยแพร่) */
  onProfile: (p: Profile) => void;
  setStatus: (s: string) => void;
}
