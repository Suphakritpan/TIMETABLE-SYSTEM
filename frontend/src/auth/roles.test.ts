import { activeRole, canAccess, homeFor, switcherOptions } from './roles';
import type { User } from '../types';

const base = { id: 'u', name: 'x', email: 'x@x', language: 'th' as const };
const head: User = { ...base, is_admin: false, memberships: [{ department_id: 'd1', department_name: 'คอม', role: 'HEAD' }] };
const both: User = {
  ...base,
  is_admin: true,
  memberships: [{ department_id: 'd1', department_name: 'คอม', role: 'HEAD' }, { department_id: 'd2', department_name: 'ไฟฟ้า', role: 'TEACHER' }],
};

test('TEACHER เข้า admin ไม่ได้ ADMIN เข้าได้', () => {
  expect(canAccess('admin', 'TEACHER')).toBe(false);
  expect(canAccess('admin', 'ADMIN')).toBe(true);
});
test('ASSISTANT เข้าหน้าสร้างตารางได้ TEACHER ไม่ได้', () => {
  expect(canAccess('timetable', 'ASSISTANT')).toBe(true);
  expect(canAccess('timetable', 'TEACHER')).toBe(false);
});
test('หน้าล็อกอินเป็นสาธารณะ แต่หน้าอื่นต้องมีบทบาท', () => {
  expect(canAccess('login', null)).toBe(true);
  expect(canAccess('home', null)).toBe(false);
});
test('ภาควิชาเดียว: บทบาทมาจาก membership', () => expect(activeRole(head)).toBe('HEAD'));
test('หลายภาควิชา: ต้องเลือก ไม่เลือก = ไม่มีบทบาท (ไม่เดา)', () => {
  expect(activeRole({ ...both, is_admin: false })).toBeNull();
  expect(activeRole(both, { departmentId: 'd2' })).toBe('TEACHER');
});
test('is_admin + เลือกโหมดผู้ดูแล = ADMIN แม้เป็น HEAD ด้วย', () => expect(activeRole(both, { asAdmin: true })).toBe('ADMIN'));
test('is_admin เท่านั้น (ไม่มี membership) = ADMIN', () => expect(activeRole({ ...base, is_admin: true, memberships: [] })).toBe('ADMIN'));
test('asAdmin แต่ไม่ได้เป็น admin ถูกเมิน', () => expect(activeRole(head, { asAdmin: true })).toBe('HEAD'));
test('หน้าแรกตามบทบาท', () => {
  expect(homeFor('HEAD')).toBe('home');
  expect(homeFor('TEACHER')).toBe('t-home');
  expect(homeFor('ADMIN')).toBe('admin');
  expect(homeFor(null)).toBe('login');
});
test('ตัวสลับมีรายการ "ผู้ดูแลสถาบัน" แยกเมื่อ is_admin', () => {
  const o = switcherOptions(both);
  expect(o).toHaveLength(3);
  expect(o.at(-1)?.label).toBe('ผู้ดูแลสถาบัน');
  expect(switcherOptions(head)).toHaveLength(1);
});
