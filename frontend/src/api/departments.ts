// ทะเบียนแผนกวิชา (3.2) — store ของ mock ใช้ร่วมกับ people.ts (ชื่อแผนกในคำเชิญ/สมาชิก) และ admin.ts
import { persist } from './persist';
import { ApiException } from './types';

export interface Department { id: string; name: string }
const SEED: Department[] = [{ id: 'd1', name: 'แผนกวิชาคอมพิวเตอร์' }, { id: 'd2', name: 'แผนกวิชาไฟฟ้า' }];
let depts: Department[] = structuredClone(SEED);
let seq = 2;
export function resetMockDepartments() { depts = structuredClone(SEED); seq = 2; }

export const departmentsSnapshot = (): Department[] => structuredClone(depts);
export const departmentName = (id: string): string => depts.find((d) => d.id === id)?.name ?? id;

export function addDepartmentRaw(name: string): Department {
  const n = name.trim();
  if (!n) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อแผนกวิชา' });
  if (depts.some((d) => d.name === n)) throw new ApiException({ code: 'DUPLICATE', message: 'มีแผนกวิชาชื่อนี้แล้ว' });
  const d = { id: `d${++seq}`, name: n };
  depts.push(d);
  return { ...d };
}
export function renameDepartmentRaw(id: string, name: string): Department {
  const n = name.trim();
  const d = depts.find((x) => x.id === id);
  if (!d) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบแผนกวิชา' });
  if (!n) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อแผนกวิชา' });
  if (depts.some((x) => x.id !== id && x.name === n)) throw new ApiException({ code: 'DUPLICATE', message: 'มีแผนกวิชาชื่อนี้แล้ว' });
  d.name = n;
  return { ...d };
}
export function removeDepartmentRaw(id: string) { depts = depts.filter((d) => d.id !== id); }

persist('departments', () => ({ seq, depts }), (v) => { seq = v.seq; depts = v.depts; });
