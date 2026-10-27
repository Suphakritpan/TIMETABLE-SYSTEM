// ตาราง map enum -> Badge อยู่ที่จุดเดียว (data-model §3) ห้ามกระจาย if/else ตามหน้า
import type { Tone } from '../components/ui/Badge';
import type { ResponseStatus } from '../api/availability';
import type { ProfileStatus } from '../types';
import type { StepView } from './steps';

export const PROFILE_STATUS: Record<ProfileStatus, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: 'info' },
  review: { label: 'ตรวจทาน', tone: 'warning' },
  published: { label: 'เผยแพร่แล้ว', tone: 'success' },
};

export const STEP_VIEW: Record<StepView, { mark: string; label: string }> = {
  done: { mark: '✓', label: 'เสร็จ' },
  current: { mark: '●', label: 'ปัจจุบัน' },
  out_of_date: { mark: '⚠', label: 'ล้าสมัย' },
  locked: { mark: '🔒', label: 'ล็อก' },
};

/** คำขอเปลี่ยน (ขั้น 8 / 4.5) */
export const REQUEST_STATUS = { waiting: { tone: 'warning', label: 'รอตัดสิน' }, approved: { tone: 'success', label: 'อนุมัติ' }, rejected: { tone: 'error', label: 'ปฏิเสธ' } } as const;
/** รายการปัญหา (ขั้น 4 / 4.3) */
export const SEVERITY_VIEW = { BLOCKER: { tone: 'error', label: 'BLOCKER' }, WARNING: { tone: 'warning', label: 'WARNING' } } as const;
/** ผล pre-check (ขั้น 5) */
export const PRECHECK_RESULT = { ok: { tone: 'success', label: 'ผ่าน' }, risky: { tone: 'warning', label: 'มีกฎเสี่ยง' }, problems: { tone: 'error', label: 'มีปัญหา จัดตารางไม่ได้' } } as const;
/** คำตอบรอบเวลาว่าง (ขั้น 3) */
export const RESPONSE_STATUS: Record<ResponseStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'ส่งแล้ว', tone: 'success' },
  any_time: { label: 'ว่างทุกเวลา (หัวหน้าบันทึก)', tone: 'success' },
  filled_by_head: { label: 'หัวหน้ากรอกแทน', tone: 'info' },
  not_yet: { label: 'ยังไม่ส่ง', tone: 'neutral' },
  late: { label: 'ล่าช้า', tone: 'error' },
};
