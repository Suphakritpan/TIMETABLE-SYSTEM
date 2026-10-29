// ภาพรวมโครงสร้างสถานศึกษา (3.x): แผนกวิชา -> รายวิชา + บุคลากร ใช้ในแท็บ "โครงสร้าง" ของผู้ดูแล
import { departmentsSnapshot } from './departments';
import { persist } from './persist';
import { listPeople, type Person } from './people';
import { delay } from './util';

export interface Subject { code: string; name: string }
export interface DepartmentStructure { id: string; name: string; subjects: Subject[]; people: Person[] }

// ทะเบียนวิชาต่อแผนก (mock) ยังไม่มีหน้าจัดการวิชา: แผนกใหม่เริ่มว่างจนกว่าจะมีส่วนเพิ่มวิชา
let subjects: Record<string, Subject[]> = {
  d1: [
    { code: 'ท.31901-2007', name: 'เทคโนโลยีการจัดการฐานข้อมูล' },
    { code: 'ป.31901-2001', name: 'การออกแบบส่วนติดต่อผู้ใช้ขั้นสูง' },
    { code: 'ท.31901-2004', name: 'การพัฒนาซอฟต์แวร์ด้วยเทคโนโลยี' },
    { code: 'ป.31900-1002', name: 'การจัดการข้อมูลขนาดใหญ่เบื้องต้น' },
    { code: 'ท.31900-1003', name: 'การสร้างสื่อดิจิทัล' },
  ],
  d2: [
    { code: 'ท.30100-1001', name: 'วงจรไฟฟ้ากระแสตรง' },
    { code: 'ป.30100-1002', name: 'เครื่องกลไฟฟ้า' },
  ],
};
export function resetMockStructure() { subjects = {}; }

export async function getStructure(): Promise<DepartmentStructure[]> {
  await delay();
  return Promise.all(departmentsSnapshot().map(async (d) => ({ ...d, subjects: structuredClone(subjects[d.id] ?? []), people: await listPeople(d.id) })));
}

persist('structure', () => subjects, (v) => { subjects = v; });
