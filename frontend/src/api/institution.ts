// mock ของ GET /api/setup/status และ POST /api/setup (api.md §2): ใช้ได้ครั้งเดียวหลังติดตั้ง จากนั้น 409
// ❓ กฎรหัสผ่าน (ความยาวต่ำสุด) ยังไม่มีในเอกสาร: ร่างไว้ 8 ตัวอักษร ต้องตกลงกับอานนท์
import { persist } from './persist';
import type { InstitutionType, User } from '../types';
import { allUsers, registerUser } from './auth';
import { ApiException } from './types';

export interface AuditEntry { at: string; action: string; by: string }
/** ข้อมูลติดต่อของสถาบัน (0.0): ไม่บังคับ = website/code/director/logo */
export interface InstitutionProfile {
  address: string; province: string; postcode: string; contact_email: string; contact_phone: string;
  website?: string; code?: string; director?: string; logo?: string;
}
export interface Institution extends Partial<InstitutionProfile> {
  name: string; type: InstitutionType; language: 'th' | 'en';
  audit?: AuditEntry[];
}
export interface SetupInput extends InstitutionProfile {
  name: string; type: InstitutionType; language: 'th' | 'en';
  firstName: string; lastName: string; displayName?: string; phone?: string; avatar?: string;
  username: string; email: string; password: string;
}
export const POSTCODE_RE = /^\d{5}$/;
export const INST_CODE_RE = /^\d{10}$/;
export const URL_RE = /^https?:\/\/\S+\.\S+$/i;
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i;
export const PHONE_RE = /^[0-9+\-\s]{8,15}$/;

export const MIN_PASSWORD = 8;
let mem: Institution | null = null;
const read = (): Institution | null => mem;
const write = (i: Institution | null) => { mem = i; };

export const getInstitution = (): Institution | null => read();
export const needsSetup = (): boolean => read() === null;

/** ทางลัดสำหรับ mock: ใช้สถาบันตัวอย่าง (อาชีวะ) พร้อมบัญชีทดลอง แทนการตั้งค่าครั้งแรก */
export function seedDemoInstitution() {
  write({ name: 'วิทยาลัยตัวอย่าง', type: 'vocational', language: 'th' });
}
export function resetMockInstitution() { write(null); }

export const getAuditLog = (): AuditEntry[] => read()?.audit ?? [];

/** ❓ รหัสผ่านต้องเก็บแบบ hash ที่ฝั่งเซิร์ฟเวอร์ (mock นี้เก็บในหน่วยความจำ) การตรวจทั้งหมดทำซ้ำที่นี่เพราะเป็นขอบเขตที่เชื่อถือไม่ได้ */
export async function setup(input: SetupInput): Promise<User> {
  await new Promise((r) => setTimeout(r, 300));
  if (read()) throw new ApiException({ code: 'ALREADY_SETUP', message: 'ระบบถูกตั้งค่าไปแล้ว' });
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const contactEmail = input.contact_email.trim().toLowerCase();
  const website = input.website?.trim();
  const code = input.code?.trim();
  if (!input.address.trim() || !input.province || !POSTCODE_RE.test(input.postcode.trim()) || !/^\S+@\S+\.\S+$/.test(contactEmail)
    || !PHONE_RE.test(input.contact_phone.trim()) || (website && !URL_RE.test(website)) || (code && !INST_CODE_RE.test(code))) {
    throw new ApiException({ code: 'VALIDATION', message: 'ข้อมูลสถาบันไม่ครบหรือไม่ถูกต้อง' });
  }
  if (!input.name.trim() || !first || !last || !USERNAME_RE.test(username) || !/^\S+@\S+\.\S+$/.test(email)
    || input.password.length < MIN_PASSWORD || (input.phone && !PHONE_RE.test(input.phone.trim()))) {
    throw new ApiException({ code: 'VALIDATION', message: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' });
  }
  const users = allUsers();
  if (users.some((u) => u.email === email)) throw new ApiException({ code: 'DUPLICATE_EMAIL', message: 'มีบัญชีใช้อีเมลนี้แล้ว' });
  if (users.some((u) => u.username?.toLowerCase() === username.toLowerCase())) throw new ApiException({ code: 'DUPLICATE_USERNAME', message: 'มีบัญชีใช้ชื่อผู้ใช้นี้แล้ว' });
  const at = new Date().toISOString();
  const admin: User = {
    id: 'u-first-admin', name: input.displayName?.trim() || `${first} ${last}`, email, language: input.language, is_admin: true, memberships: [],
    username, first_name: first, last_name: last, phone: input.phone?.trim() || undefined, avatar: input.avatar,
    created_at: at, status: 'active', email_verified: false, // ไม่มี SMTP จึงยังยืนยันอีเมลไม่ได้
  };
  write({
    name: input.name.trim(), type: input.type, language: input.language,
    address: input.address.trim(), province: input.province, postcode: input.postcode.trim(), contact_email: contactEmail, contact_phone: input.contact_phone.trim(),
    website: website || undefined, code: code || undefined, director: input.director?.trim() || undefined, logo: input.logo,
    audit: [{ at, action: 'สร้างสถาบันและบัญชีผู้ดูแลคนแรก', by: admin.id }],
  });
  registerUser(admin, input.password);
  return admin;
}

persist('institution', () => mem, (v) => { mem = v; });
