import {
  adminAddDepartment, adminAddSharedRoom, adminAddTerm, adminDeleteDepartment, adminDeleteTerm, adminInviteHead, adminListDepartments,
  adminListSharedRooms, adminListTerms, adminOverview, adminRemoveHead, adminRemoveSharedRoom, adminResendHeadInvite, adminSetHolidays,
  adminUpdateTerm, resetMockAdmin,
} from './admin';
import { acceptInvite, getInvite, resetMockPeople } from './people';
import { resetMockAuth } from './auth';
import { resetMockDepartments } from './departments';
import { createProfile, listProfiles, listTerms, resetMockProfiles } from './profiles';
import { resetMockTerms } from './terms';

const A = 'ADMIN' as const;
beforeEach(() => { resetMockTerms(); resetMockDepartments(); resetMockAuth(); resetMockPeople(); resetMockProfiles(); resetMockAdmin(); });

test('สิทธิ์: ไม่ใช่ ADMIN ถูกปฏิเสธทุกคำสั่ง (ตรวจที่ชั้น API ไม่ใช่แค่ซ่อนปุ่ม)', async () => {
  await expect(adminListTerms('HEAD')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(adminAddDepartment('TEACHER', 'x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(adminOverview(null, 't-2-2569')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

describe('3.4 ปฏิทินการศึกษา', () => {
  test('เพิ่มภาคเรียน: ภาคใหม่ไปโผล่ในตัวเลือกภาคของโปรไฟล์ (ต้นทางเดียว)', async () => {
    await adminAddTerm(A, { no: 1, year_ce: 2028, start_date: '2028-05-15', end_date: '2028-09-20' });
    expect((await listTerms()).map((t) => t.id)).toContain('t-1-2571');
    const p = await createProfile('d1', { name: 'ภาคใหม่', term_id: 't-1-2571', programs: ['ปวส.'] });
    expect(p.term_id).toBe('t-1-2571');
  });
  test('ตรวจข้อมูล: วันเริ่มต้องก่อนสิ้นสุด, ภาคซ้ำ, ช่วงวันที่ทับกัน', async () => {
    await expect(adminAddTerm(A, { no: 1, year_ce: 2028, start_date: '2028-09-20', end_date: '2028-05-15' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(adminAddTerm(A, { no: 1, year_ce: 2027, start_date: '2030-01-01', end_date: '2030-02-01' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(adminAddTerm(A, { no: 3, year_ce: 2027, start_date: '2027-06-01', end_date: '2027-07-01' })).rejects.toMatchObject({ code: 'TERM_OVERLAP' });
    await expect(adminAddTerm(A, { no: 4, year_ce: 2028, start_date: '2028-01-01', end_date: '2028-02-01' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  test('วันหยุด: ต้องอยู่ในช่วงภาค ไม่ซ้ำวัน; แก้ช่วงวันที่ไม่ให้ตัดวันหยุดทิ้ง', async () => {
    await expect(adminSetHolidays(A, 't-1-2570', [{ day: '2027-01-01', name: 'ปีใหม่' }])).rejects.toMatchObject({ code: 'HOLIDAY_OUTSIDE' });
    await expect(adminSetHolidays(A, 't-1-2570', [{ day: '2027-06-03', name: 'ก' }, { day: '2027-06-03', name: 'ข' }])).rejects.toMatchObject({ code: 'DUPLICATE' });
    const t = await adminSetHolidays(A, 't-1-2570', [{ day: '2027-07-28', name: 'วันเฉลิมฯ' }, { day: '2027-06-03', name: 'ราชินี' }]);
    expect(t.holidays.map((h) => h.day)).toEqual(['2027-06-03', '2027-07-28']);
    await expect(adminUpdateTerm(A, 't-1-2570', { start_date: '2027-06-10', end_date: '2027-09-24' })).rejects.toMatchObject({ code: 'HOLIDAY_OUTSIDE' });
  });
  test('ลบภาคเรียนที่มีโปรไฟล์ใช้อยู่ไม่ได้ (TERM_IN_USE), ภาคที่ไม่มีใครใช้ลบได้', async () => {
    await expect(adminDeleteTerm(A, 't-2-2569')).rejects.toMatchObject({ code: 'TERM_IN_USE' });
    await adminDeleteTerm(A, 't-2-2570');
    expect((await adminListTerms(A)).map((t) => t.id)).not.toContain('t-2-2570');
    await expect(createProfile('d1', { name: 'x', term_id: 't-2-2570', programs: ['ปวส.'] })).rejects.toMatchObject({ code: 'TERM_NOT_IN_CALENDAR' });
  });
});

describe('3.2 แผนกวิชา + หัวหน้า', () => {
  test('สร้างแผนก (ชื่อห้ามว่าง/ซ้ำ) แล้วเชิญหัวหน้า → รับคำเชิญ → เป็นหัวหน้าแผนกนั้น', async () => {
    await expect(adminAddDepartment(A, ' ')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(adminAddDepartment(A, 'แผนกวิชาไฟฟ้า')).rejects.toMatchObject({ code: 'DUPLICATE' });
    const d = await adminAddDepartment(A, 'แผนกวิชาการบัญชี');
    const { invite_url } = await adminInviteHead(A, d.id, 'acc.head@school.test');
    const tk = invite_url.replace('#/invite/', '');
    expect(await getInvite(tk)).toMatchObject({ department_name: 'แผนกวิชาการบัญชี', role: 'HEAD' });
    const u = await acceptInvite(tk, { name: 'หัวหน้าบัญชี', password: 'longenough1' });
    expect(u.memberships[0]).toMatchObject({ department_id: d.id, role: 'HEAD' });
    const row = (await adminListDepartments(A)).find((r) => r.id === d.id)!;
    expect(row.head).toMatchObject({ name: 'หัวหน้าบัญชี' });
  });
  test('แผนกมีหัวหน้า/คำเชิญหัวหน้าแล้วเชิญซ้ำไม่ได้ (HEAD_EXISTS); ส่งลิงก์ใหม่ได้; ถอดหัวหน้าแล้วเชิญใหม่ได้', async () => {
    await expect(adminInviteHead(A, 'd1', 'x@school.test')).rejects.toMatchObject({ code: 'HEAD_EXISTS' });
    const d = await adminAddDepartment(A, 'แผนกใหม่');
    await adminInviteHead(A, d.id, 'h@school.test');
    await expect(adminInviteHead(A, d.id, 'h2@school.test')).rejects.toMatchObject({ code: 'HEAD_EXISTS' });
    expect((await adminResendHeadInvite(A, d.id)).invite_url).toMatch(/^#\/invite\//);
    expect((await adminListDepartments(A)).find((r) => r.id === d.id)!.head_invited).toBe('h@school.test');
    await adminRemoveHead(A, 'd1');
    expect((await adminListDepartments(A)).find((r) => r.id === 'd1')!.head).toBeNull();
    await adminInviteHead(A, 'd1', 'new.head@school.test');
  });
  test('ลบแผนกที่ยังมีคน/โปรไฟล์ไม่ได้; แผนกว่างลบได้', async () => {
    await expect(adminDeleteDepartment(A, 'd1')).rejects.toMatchObject({ code: 'DEPARTMENT_NOT_EMPTY' });
    const d = await adminAddDepartment(A, 'แผนกชั่วคราว');
    await adminDeleteDepartment(A, d.id);
    expect((await adminListDepartments(A)).some((r) => r.id === d.id)).toBe(false);
  });
});

test('3.3 ห้องร่วม: เพิ่ม/ลบ ตรวจชื่อซ้ำ ที่นั่ง', async () => {
  expect(await adminListSharedRooms(A)).toHaveLength(1);
  await expect(adminAddSharedRoom(A, { name: 'หอประชุมเล็ก', type: 'ห้องประชุม', seats: 10 })).rejects.toMatchObject({ code: 'DUPLICATE' });
  await expect(adminAddSharedRoom(A, { name: 'X', type: 'ห้องประชุม', seats: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
  const r = await adminAddSharedRoom(A, { name: 'ลานกีฬา', type: 'สนาม', seats: 200 });
  await adminRemoveSharedRoom(A, r.id);
  expect(await adminListSharedRooms(A)).toHaveLength(1);
});

test('3.1 ภาพรวม: แผนกไหนเผยแพร่/กำลังทำ/ยังไม่เริ่มในภาคนี้ และมีหัวหน้าหรือยัง', async () => {
  const rows = await adminOverview(A, 't-2-2569');
  expect(rows.find((r) => r.department_id === 'd1')).toMatchObject({ progress: 'in_progress', has_head: true, profile_name: 'ตารางเรียน ภาค 2/2569' });
  expect(rows.find((r) => r.department_id === 'd2')).toMatchObject({ progress: 'not_started', has_head: false });
  expect((await adminOverview(A, 't-1-2570')).every((r) => r.progress === 'not_started')).toBe(true);
  expect((await listProfiles('d1')).length).toBe(1);
});
