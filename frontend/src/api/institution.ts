// mock ของ GET /api/setup/status และ POST /api/setup (api.md §2): ใช้ได้ครั้งเดียวหลังติดตั้ง จากนั้น 409
// ❓ กฎรหัสผ่าน (ความยาวต่ำสุด) ยังไม่มีในเอกสาร: ร่างไว้ 8 ตัวอักษร ต้องตกลงกับอานนท์
import type { InstitutionType, User } from '../types';
import { registerUser } from './auth';
import { ApiException } from './types';

export interface Institution { name: string; type: InstitutionType; language: 'th' | 'en' }
export interface SetupInput extends Institution { adminName: string; email: string; password: string }

export const MIN_PASSWORD = 8;
const KEY = 'timetable.mock.institution';
let mem: Institution | null = null;

// localStorage เก็บแทน "ฐานข้อมูล" ของ mock ให้รีเฟรชแล้วไม่ต้องตั้งค่าซ้ำ อ่าน/เขียนไม่ได้ก็ใช้หน่วยความจำ
function read(): Institution | null {
  if (mem) return mem;
  try {
    const s = localStorage.getItem(KEY);
    return s ? (mem = JSON.parse(s) as Institution) : null;
  } catch {
    return null;
  }
}
function write(i: Institution | null) {
  mem = i;
  try {
    if (i) localStorage.setItem(KEY, JSON.stringify(i));
    else localStorage.removeItem(KEY);
  } catch { /* ใช้หน่วยความจำต่อ */ }
}

export const getInstitution = (): Institution | null => read();
export const needsSetup = (): boolean => read() === null;

/** ทางลัดสำหรับ mock: ใช้สถาบันตัวอย่าง (อาชีวะ) พร้อมบัญชีทดลอง แทนการตั้งค่าครั้งแรก */
export function seedDemoInstitution() {
  write({ name: 'วิทยาลัยตัวอย่าง', type: 'vocational', language: 'th' });
}
export function resetMockInstitution() { write(null); }

export async function setup(input: SetupInput): Promise<User> {
  await new Promise((r) => setTimeout(r, 300));
  if (read()) throw new ApiException({ code: 'ALREADY_SETUP', message: 'ระบบถูกตั้งค่าไปแล้ว' });
  if (!input.name.trim() || !input.adminName.trim() || !/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < MIN_PASSWORD) {
    throw new ApiException({ code: 'VALIDATION', message: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' });
  }
  write({ name: input.name.trim(), type: input.type, language: input.language });
  const admin: User = { id: 'u-first-admin', name: input.adminName.trim(), email: input.email.trim().toLowerCase(), language: input.language, is_admin: true, memberships: [] };
  registerUser(admin, input.password);
  return admin;
}
