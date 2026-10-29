// mock ของ api.md §5 (โปรไฟล์) ใช้จนกว่า backend พร้อม: เก็บในหน่วยความจำ เปลี่ยนไฟล์นี้ไฟล์เดียวเมื่อมี API จริง
import { persist } from './persist';
import { complete as completeStep, edit as editStep, initialSteps, type StepStatus } from '../profile/steps';
import type { Profile, Term, YearPlan } from '../types';
import { allUsers } from './auth';
import { notify } from './notifications';
import { termExists, termsSnapshot } from './terms';
import { ApiException } from './types';
import { delay } from './util';


let seq = 100;
const plans = (programs: string[], years: number[], steps?: (p: string, y: number) => StepStatus[]): YearPlan[] =>
  programs.flatMap((program) => years.map((year) => ({ id: `yp${++seq}`, program, year, steps: steps?.(program, year) ?? initialSteps() })));

const done = (n: number): StepStatus[] => initialSteps().map((_, i) => (i < n ? 'done' : 'todo'));

let profiles: Profile[] = [];
export function resetMockProfiles() {
  seq = 100;
  profiles = [
    {
      id: 'p1', department_id: 'd1', name: 'ตารางเรียน ภาค 2/2569', term_id: 't-2-2569', status: 'draft', version_no: 1, family_id: 'p1', published_at: null,
      year_plans: plans(['ปวส.'], [1, 2], (_p, y) => (y === 1 ? done(5) : done(2))),
    },
  ];
}
resetMockProfiles();

export async function listTerms(): Promise<Term[]> { await delay(); return termsSnapshot().map(({ id, no, year_ce }) => ({ id, no, year_ce })); }

export async function listProfiles(departmentId: string): Promise<Profile[]> {
  await delay();
  return structuredClone(profiles.filter((p) => p.department_id === departmentId));
}

export async function getProfile(id: string): Promise<Profile> {
  await delay();
  const p = profiles.find((x) => x.id === id);
  if (!p) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบโปรไฟล์นี้ หรือไม่ได้อยู่ในแผนกที่เข้าถึงได้' });
  return structuredClone(p);
}

function requireTerm(termId: string) {
  if (!termExists(termId)) throw new ApiException({ code: 'TERM_NOT_IN_CALENDAR', message: 'ภาคเรียนนี้ยังไม่อยู่ในปฏิทินการศึกษา ให้ผู้ดูแลระบบสถาบันเพิ่มก่อน' });
}

export interface NewProfile { name: string; term_id: string; programs: string[] }

export async function createProfile(departmentId: string, input: NewProfile): Promise<Profile> {
  await delay();
  if (!input.name.trim()) throw new ApiException({ code: 'VALIDATION', message: 'กรอกชื่อโปรไฟล์' });
  if (!input.programs.length) throw new ApiException({ code: 'VALIDATION', message: 'เลือกอย่างน้อย 1 หลักสูตร' });
  requireTerm(input.term_id);
  const p: Profile = {
    id: `p${++seq}`, department_id: departmentId, name: input.name.trim(), term_id: input.term_id, status: 'draft', version_no: 1, family_id: '', published_at: null,
    year_plans: plans(input.programs, [1, 2]),
  };
  p.family_id = p.id;
  profiles.push(p);
  return structuredClone(p);
}

/** คัดลอกจากภาคก่อน: ได้โครงหลักสูตร × ชั้นปีเดิม แต่ทุกขั้นเริ่มใหม่ (ข้อมูลภาคใหม่ต้องยืนยันอีกครั้ง) */
export async function copyProfile(id: string, termId: string): Promise<Profile> {
  await delay();
  const src = profiles.find((x) => x.id === id);
  if (!src) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบโปรไฟล์ต้นทาง' });
  requireTerm(termId);
  const p: Profile = {
    ...structuredClone(src), id: `p${++seq}`, name: `สำเนาของ ${src.name}`, term_id: termId, status: 'draft', version_no: 1, published_at: null,
    year_plans: src.year_plans.map((y) => ({ ...y, id: `yp${++seq}`, steps: initialSteps() })),
  };
  p.family_id = p.id;
  profiles.push(p);
  return structuredClone(p);
}

/** ทำขั้นเสร็จ (action: complete) หรือแก้ขั้นที่เสร็จแล้ว (action: edit) ตามกฎใน profile/steps.ts */
export async function updateStep(profileId: string, yearPlanId: string, step: number, action: 'complete' | 'edit'): Promise<Profile> {
  await delay();
  const p = profiles.find((x) => x.id === profileId);
  const yp = p?.year_plans.find((y) => y.id === yearPlanId);
  if (!p || !yp) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบข้อมูล' });
  if (p.status === 'published') throw new ApiException({ code: 'VERSION_LOCKED', message: 'เวอร์ชันที่เผยแพร่แล้วแก้ไม่ได้ ให้เริ่มการเปลี่ยนแปลงเพื่อสร้างเวอร์ชันใหม่' });
  try {
    yp.steps = action === 'complete' ? completeStep(yp.steps, step) : editStep(yp.steps, step);
  } catch (e) {
    const code = e instanceof Error && e.message.startsWith('STEP_NOT_DONE') ? 'STEP_NOT_DONE' : 'STEP_LOCKED';
    throw new ApiException({ code, message: code === 'STEP_LOCKED' ? 'ต้องทำขั้นก่อนหน้าให้เสร็จก่อน' : 'ขั้นนี้ยังไม่เสร็จ แก้ไขไม่ได้' });
  }
  return structuredClone(p);
}

/** ขั้น 9: เผยแพร่ (เฉพาะ HEAD) ทุก หลักสูตร × ชั้นปี ต้องทำขั้น 1–8 ครบ แล้วเวอร์ชันถูกล็อก (VERSION_LOCKED) */
export async function publishProfile(profileId: string, role: string): Promise<Profile> {
  await delay();
  const p = profiles.find((x) => x.id === profileId);
  if (!p) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบโปรไฟล์' });
  if (role !== 'HEAD') throw new ApiException({ code: 'HEAD_ONLY', message: 'เฉพาะหัวหน้าเท่านั้นที่เผยแพร่ได้' });
  if (p.status === 'published') throw new ApiException({ code: 'VERSION_LOCKED', message: 'เวอร์ชันนี้เผยแพร่แล้ว' });
  const incomplete = p.year_plans.filter((y) => y.steps.slice(0, 8).some((s) => s !== 'done'));
  if (incomplete.length) {
    throw new ApiException({ code: 'STEP_INCOMPLETE', message: `ยังทำไม่ครบขั้น 1–8: ${incomplete.map((y) => `${y.program} ปี ${y.year}`).join(', ')}` });
  }
  p.status = 'published';
  p.published_at = Date.now();
  p.year_plans.forEach((y) => { y.steps[8] = 'done'; });
  allUsers().filter((u) => u.memberships.some((m) => m.department_id === p.department_id)).forEach((u) => notify(u.id, `เผยแพร่แล้ว: ${p.name}`, 'published'));
  return structuredClone(p);
}

/** ขั้น 8: หัวหน้า/ผู้ช่วยส่งเข้าตรวจทาน (status -> review) ต้องทำขั้น 1–7 ครบทุก หลักสูตร × ชั้นปี */
export async function sendToReview(profileId: string): Promise<Profile> {
  await delay();
  const p = profiles.find((x) => x.id === profileId);
  if (!p) throw new ApiException({ code: 'NOT_FOUND', message: 'ไม่พบโปรไฟล์' });
  if (p.status === 'published') throw new ApiException({ code: 'VERSION_LOCKED', message: 'เวอร์ชันนี้เผยแพร่แล้ว' });
  const incomplete = p.year_plans.filter((y) => y.steps.slice(0, 7).some((s) => s !== 'done'));
  if (incomplete.length) {
    throw new ApiException({ code: 'STEP_INCOMPLETE', message: `ยังทำไม่ครบขั้น 1–7: ${incomplete.map((y) => `${y.program} ปี ${y.year}`).join(', ')}` });
  }
  p.status = 'review';
  return structuredClone(p);
}

/** สถานะโปรไฟล์ล้วน ๆ สำหรับ API อื่นที่ต้องอ่าน (ไม่เปลี่ยนค่า) */
export function profileStatusSync(profileId: string): Profile['status'] | null {
  return profiles.find((x) => x.id === profileId)?.status ?? null;
}

persist('profiles', () => ({ seq, profiles }), (v) => { seq = v.seq; profiles = v.profiles; });
