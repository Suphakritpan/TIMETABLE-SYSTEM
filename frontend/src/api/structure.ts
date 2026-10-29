// ภาพรวมโครงสร้างสถานศึกษา: แผนกวิชา + บุคลากร (mock) และหลักสูตร/รายวิชาที่นำเข้าจากไฟล์ CSV
import { departmentsSnapshot } from './departments';
import { listPeople, type Person } from './people';
import { delay } from './util';

export interface DepartmentPeople { id: string; name: string; people: Person[] }

export async function getStructure(): Promise<DepartmentPeople[]> {
  await delay();
  return Promise.all(departmentsSnapshot().map(async (d) => ({ ...d, people: await listPeople(d.id) })));
}

export interface Course { y: number; t: string; code: string; name: string; kind: 'course' | 'activity' | 'elective_slot'; cr: number; lec: number; lab: number; check?: true }
export interface CurriculumRow { plan: string; year: number | null; variant: string; courses: Course[] }
export interface CatalogDept { id: string; name: string; hint: string[]; curricula: CurriculumRow[] }
export interface Institution { id: string; name: string; level: string; departments: CatalogDept[] }
/** สถานศึกษา -> แผนก -> หลักสูตร -> รายวิชา จาก DB/test_pdf/วิชา (สร้างด้วย DB/build_curricula.py) โหลดเมื่อเปิดหน้านี้เท่านั้น */
export const getCatalog = async (): Promise<Institution[]> => (await import('../data/curricula.json')).default as Institution[];
