// คำเรียกตามประเภทสถานศึกษา (ADR 0002: อาชีวะก่อน) ใช้ในข้อความหน้าจอเท่านั้น โค้ด/API ใช้ department, teacher
import type { InstitutionType } from '../types';

const TERMS = {
  vocational: { department: 'แผนกวิชา', teacher: 'ครู', head: 'หัวหน้าแผนก', assistant: 'ผู้ช่วย', admin: 'ผู้ดูแลสถาบัน' },
  university: { department: 'ภาควิชา', teacher: 'อาจารย์', head: 'หัวหน้าภาควิชา', assistant: 'ผู้ช่วย', admin: 'ผู้ดูแลสถาบัน' },
} as const;

export type TermKey = keyof typeof TERMS.vocational;
export const term = (type: InstitutionType, key: TermKey): string => (TERMS[type] ?? TERMS.vocational)[key];
