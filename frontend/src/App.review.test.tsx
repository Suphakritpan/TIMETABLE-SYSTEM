import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { resetMockAuth } from './api/auth';
import { resetMockAvailability } from './api/availability';
import { seedDemoInstitution } from './api/institution';
import { resetMockIssues } from './api/issues';
import { resetMockPeople } from './api/people';
import { getProfile, resetMockProfiles, sendToReview, updateStep } from './api/profiles';
import { listLog, listNotifications, resetMockReview } from './api/review';
import { resetMockRules } from './api/rules';
import { saveLastRun } from './api/runs';
import type { ClassItem } from './types';

const T = 40000;
const item = (id: string, over: Partial<ClassItem>): ClassItem => ({ id, day: 0, start: 1, span: 2, code: `ท.${id}`, name: `วิชา ${id}`, room: `R${id}`, teacher: 'ไมตรี', status: 'ok', ...over });

// ตารางตัวอย่าง: a, c เป็นของครูปฐพนพัทธ์ (u-teacher), b เป็นของครูอื่น
const PLACED = [item('a', { teacher: 'ปฐพนพัทธ์', room: 'RA' }), item('b', { teacher: 'ไมตรี', day: 1 }), item('c', { teacher: 'ปฐพนพัทธ์', room: 'RC', day: 2, start: 3 })];

async function putInReview() {
  const p = await getProfile('p1');
  for (const y of p.year_plans) for (let s = 0; s < 7; s++) if (y.steps[s] !== 'done') await updateStep('p1', y.id, s, 'complete');
  saveLastRun('p1', { status: 'ok', score: 90, placed: PLACED, unplaced: [] });
  await sendToReview('p1');
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockAuth();
  resetMockPeople();
  resetMockProfiles();
  resetMockRules();
  resetMockAvailability();
  resetMockIssues();
  resetMockReview();
  window.location.hash = '';
});

async function signIn(email: string) {
  await userEvent.type(await screen.findByLabelText('อีเมล'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

test('4.4 ก่อนส่งตรวจทาน: ครูยังไม่เห็นตาราง (ร่างไม่เปิดให้ครู)', async () => {
  window.location.hash = '#/my-timetable';
  render(<App />);
  await signIn('teacher@demo.test');
  expect(await screen.findByText(/ยังไม่มีตารางที่เปิดให้ดู/)).toBeInTheDocument();
}, T);

test('4.4/4.5 ครู: เห็นเฉพาะคาบของตัวเอง ป้าย DRAFT; ขอเปลี่ยนต้องมีเหตุผล; ขอซ้ำไม่ได้; เห็นคำขอที่ 4.5', async () => {
  await putInReview();
  window.location.hash = '#/my-timetable';
  render(<App />);
  await signIn('teacher@demo.test');
  expect(await screen.findByText('DRAFT (กำลังตรวจทาน)')).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: /ท\.a/ })).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: /ท\.c/ })).toBeInTheDocument();
  expect(screen.queryByRole('gridcell', { name: /ท\.b/ })).toBeNull(); // คาบของครูอื่นต้องไม่รั่ว

  await userEvent.click(screen.getByRole('gridcell', { name: /ท\.a/ }));
  await userEvent.click(screen.getByRole('button', { name: 'ขอเปลี่ยน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ใส่เหตุผลที่ขอเปลี่ยน');
  await userEvent.type(screen.getByLabelText('เหตุผลที่ขอเปลี่ยน'), 'มีสอนที่อื่น');
  await userEvent.click(screen.getByRole('button', { name: 'ขอเปลี่ยน' }));
  expect(await screen.findByText(/ส่งคำขอเปลี่ยนแล้ว/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('link', { name: 'คำขอของฉัน' }));
  expect(await screen.findByText('มีสอนที่อื่น')).toBeInTheDocument();
  expect(screen.getByText('รอตัดสิน')).toBeInTheDocument();
}, T);

test('ขั้น 8 หัวหน้า: ปฏิเสธต้องมีหมายเหตุ แล้วครูเห็นที่ 4.5; direct edit ต้องระบุตกลงกับใคร ห้ามชน และแจ้งครู', async () => {
  await putInReview();
  const { createRequest } = await import('./api/review');
  const { MOCK_USERS } = await import('./api/auth');
  await createRequest('p1', MOCK_USERS.find((u) => u.id === 'u-teacher')!, { class_id: 'a', reason: 'ติดธุระ' });

  const first = render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });
  await userEvent.click(screen.getByRole('button', { name: /^8\./ }));

  const table = await screen.findByRole('table', { name: 'คำขอเปลี่ยน' });
  expect(within(table).getByText('ติดธุระ')).toBeInTheDocument();
  expect(within(table).getByText(/ไม่กระทบคาบอื่น|ต้องขยับอีก/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'เสร็จขั้นตรวจทาน' })).toBeDisabled();

  await userEvent.click(within(table).getByRole('button', { name: 'ปฏิเสธ' }));
  const dlg = screen.getByRole('dialog', { name: 'ปฏิเสธคำขอ' });
  await userEvent.click(within(dlg).getByRole('button', { name: 'ปฏิเสธคำขอ' }));
  expect(await within(dlg).findByRole('alert')).toHaveTextContent('ปฏิเสธต้องใส่หมายเหตุ');
  await userEvent.type(within(dlg).getByLabelText(/หมายเหตุถึงอาจารย์/), 'ไม่มีคาบว่างให้ย้าย');
  await userEvent.click(within(dlg).getByRole('button', { name: 'ปฏิเสธคำขอ' }));
  expect(await screen.findByText('ปฏิเสธ', { selector: '.badge' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'เสร็จขั้นตรวจทาน' })).toBeEnabled());

  // direct edit
  const fs = screen.getByRole('group', { name: 'แก้ตรง ๆ (direct edit)' });
  await userEvent.selectOptions(within(fs).getByLabelText('คาบ'), 'a');
  await userEvent.selectOptions(within(fs).getByLabelText('ย้ายไปวัน'), '3');
  await userEvent.click(within(fs).getByRole('button', { name: 'แก้ตรง ๆ' }));
  expect(await screen.findByText('ระบุว่าตกลงกับใคร')).toBeInTheDocument();
  await userEvent.type(within(fs).getByLabelText('ตกลงกับ'), 'ครูปฐพนพัทธ์');
  await userEvent.click(within(fs).getByRole('button', { name: 'แก้ตรง ๆ' }));
  expect(await screen.findByText(/ท\.a: จันทร์ คาบ 1 → พฤหัสบดี คาบ 1 · ตกลงกับ ครูปฐพนพัทธ์/)).toBeInTheDocument();
  expect(await listLog('p1')).toHaveLength(1);
  first.unmount();

  const notes = (await listNotifications('u-teacher')).map((n) => n.body);
  expect(notes).toContain('คำขอเปลี่ยนของคุณถูกปฏิเสธ: ไม่มีคาบว่างให้ย้าย');
  expect(notes.some((n) => n.startsWith('แก้โดย') && n.includes('ตกลงกับ ครูปฐพนพัทธ์'))).toBe(true);
}, T);

test('ขั้น 8 ฝั่งหัวหน้า ก่อนส่งตรวจทาน: ปุ่มส่งเข้าตรวจทานส่งได้เมื่อขั้น 1–7 ครบ', async () => {
  const p = await getProfile('p1');
  for (const y of p.year_plans) for (let s = 0; s < 7; s++) if (y.steps[s] !== 'done') await updateStep('p1', y.id, s, 'complete');
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });
  await userEvent.click(screen.getByRole('button', { name: /^8\./ }));
  await userEvent.click(await screen.findByRole('button', { name: 'ส่งเข้าตรวจทาน' }));
  expect(await screen.findByText(/อยู่ในขั้นตรวจทาน/)).toBeInTheDocument();
}, T);
