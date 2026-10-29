// บทบาทตาม decisions D12: ADMIN = user.is_admin (ระดับสถาบัน) ส่วน HEAD/ASSISTANT/TEACHER อยู่ที่ membership ต่อภาควิชา
// การป้องกันที่นี่เป็นเพียงการซ่อน/เปลี่ยนเส้นทางใน UI ตัวจริงตรวจที่ backend (api.md §1)
import type { Role, User } from '../types';

export type RouteKey = 'login' | 'setup' | 'invite' | 'reset' | 'notifications' | 'account' | 'home' | 'people' | 'profiles' | 'workspace' | 'timetable' | 'review' | 'admin' | 't-home' | 'availability' | 'my-issues' | 'my-timetable' | 'my-requests' | 'structure';

type PublicKey = 'login' | 'setup' | 'invite' | 'reset';

/** เส้นทางที่ต้องล็อกอิน -> บทบาทที่เข้าได้ */
const ROUTES: Record<Exclude<RouteKey, PublicKey>, Role[]> = {
  notifications: ['ADMIN', 'HEAD', 'ASSISTANT', 'TEACHER'],
  account: ['ADMIN', 'HEAD', 'ASSISTANT', 'TEACHER'],
  structure: ['ADMIN', 'HEAD', 'ASSISTANT', 'TEACHER'],
  home: ['HEAD', 'ASSISTANT'],
  people: ['HEAD', 'ASSISTANT'],
  profiles: ['HEAD', 'ASSISTANT'],
  workspace: ['HEAD', 'ASSISTANT'],
  timetable: ['HEAD', 'ASSISTANT'],
  review: ['HEAD', 'ASSISTANT'],
  admin: ['ADMIN'],
  't-home': ['TEACHER'],
  availability: ['TEACHER'],
  'my-issues': ['TEACHER'],
  'my-timetable': ['TEACHER'],
  'my-requests': ['TEACHER'],
};

export const isPublic = (s: string): s is PublicKey => s === 'login' || s === 'setup' || s === 'invite' || s === 'reset';
export const isRouteKey = (s: string): s is RouteKey => isPublic(s) || Object.hasOwn(ROUTES, s);

export interface RoleContext { departmentId?: string; asAdmin?: boolean }

/** บทบาทที่ใช้งานอยู่: ADMIN เมื่อเลือกโหมดผู้ดูแล มิฉะนั้นบทบาทใน membership ของภาควิชาที่เลือก (หลายภาควิชาแล้วไม่เลือก = ไม่เดา) */
export function activeRole(user: User | null, { departmentId, asAdmin }: RoleContext = {}): Role | null {
  if (!user) return null;
  if (asAdmin && user.is_admin) return 'ADMIN';
  const m = user.memberships.find((x) => x.department_id === departmentId) ?? (user.memberships.length === 1 ? user.memberships[0] : undefined);
  return m?.role ?? (user.is_admin && user.memberships.length === 0 ? 'ADMIN' : null);
}

export const canAccess = (route: RouteKey, role: Role | null): boolean =>
  isPublic(route) || (role !== null && ROUTES[route].includes(role));

/** หน้าแรกหลังล็อกอินตามบทบาท (pages-and-routes: HEAD/ASSISTANT 2.1, TEACHER 4.1, ADMIN 3.1) */
export const homeFor = (role: Role | null): RouteKey =>
  role === 'HEAD' || role === 'ASSISTANT' ? 'home' : role === 'TEACHER' ? 't-home' : role === 'ADMIN' ? 'admin' : 'login';

export interface SwitcherOption extends RoleContext { key: string; label: string; role: Role }

/** ตัวสลับ: ภาควิชาที่สังกัด + "ผู้ดูแลสถาบัน" แยกเมื่อ is_admin */
export const switcherOptions = (user: User): SwitcherOption[] => [
  ...user.memberships.map((m) => ({ key: `d:${m.department_id}`, departmentId: m.department_id, asAdmin: false, label: m.department_name, role: m.role as Role })),
  ...(user.is_admin ? [{ key: 'admin', asAdmin: true, label: 'ผู้ดูแลสถาบัน', role: 'ADMIN' as Role }] : []),
];
