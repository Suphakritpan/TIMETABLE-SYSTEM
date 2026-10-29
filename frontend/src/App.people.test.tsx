import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { resetMockAuth } from './api/auth';
import { seedDemoInstitution } from './api/institution';
import { createInvite, resetMockPeople } from './api/people';
import { resetMockProfiles } from './api/profiles';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockAuth();
  resetMockPeople();
  resetMockProfiles();
  window.location.hash = '';
});

async function signIn(email: string) {
  await userEvent.type(screen.getByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

test('2.3 หัวหน้าเชิญครู -> ได้ลิงก์ให้คัดลอก (ไม่มี SMTP) และเห็นสถานะ "เชิญแล้ว"', async () => {
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'บุคลากรและห้อง' }));
  expect(await screen.findByRole('cell', { name: 'นายวรากร รักเรียน' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /เชิญครู\/ผู้ช่วย/ }));
  const dlg = screen.getByRole('dialog', { name: 'เชิญบุคลากร' });
  await userEvent.type(within(dlg).getByLabelText('อีเมล'), 'newbie@school.test');
  await userEvent.click(within(dlg).getByRole('button', { name: 'สร้างลิงก์เชิญ' }));

  expect(await screen.findByText(/ลิงก์เชิญ newbie@school\.test/)).toBeInTheDocument();
  expect(screen.getByText(/#\/invite\/tk/)).toBeInTheDocument();
  expect(await screen.findByText('เชิญแล้ว รอตอบรับ')).toBeInTheDocument();
});

test('2.3 ผู้ช่วย: เลือกเชิญผู้ช่วยไม่ได้, ปุ่มลบปิดพร้อมเหตุผล', async () => {
  render(<App />);
  await signIn('assistant@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'บุคลากรและห้อง' }));
  await screen.findByRole('cell', { name: 'นายวรากร รักเรียน' });
  const removes = screen.getAllByRole('button', { name: 'ลบ' });
  expect(removes.length).toBeGreaterThan(0);
  expect(removes[0]).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /เชิญครู\/ผู้ช่วย/ }));
  expect(within(screen.getByRole('dialog')).getByRole('option', { name: /ผู้ช่วย \(เฉพาะหัวหน้า\)/ })).toBeDisabled();
});

test('2.3 ห้อง: เพิ่มห้องแล้วเห็นในรายการ', async () => {
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'บุคลากรและห้อง' }));
  await userEvent.click(await screen.findByRole('tab', { name: 'ห้อง' }));
  expect(await screen.findByRole('cell', { name: 'COM602' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'เพิ่มห้อง' }));
  const dlg = screen.getByRole('dialog', { name: 'เพิ่มห้อง' });
  await userEvent.type(within(dlg).getByLabelText('ชื่อห้อง'), 'COM701');
  await userEvent.click(within(dlg).getByRole('button', { name: 'เพิ่ม' }));
  expect(await screen.findByRole('cell', { name: 'COM701' })).toBeInTheDocument();
});

test('0.3 รับคำเชิญ (ผู้ใช้ใหม่): สร้างบัญชีแล้วเข้าหน้าแรกของอาจารย์ (4.1)', async () => {
  const { invite_url } = await createInvite('d1', { email: 'new@school.test', role: 'TEACHER' }, 'HEAD');
  window.location.hash = invite_url;
  render(<App />);
  expect(await screen.findByText(/แผนกวิชาคอมพิวเตอร์/)).toBeInTheDocument();
  expect(screen.getByLabelText('อีเมล')).toHaveValue('new@school.test');
  expect(screen.getByLabelText('ชื่อผู้ใช้ (Username)')).toHaveValue('new');
  await userEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีและเข้าร่วม' }));
  expect(await screen.findByText('กรอกชื่อจริง')).toBeInTheDocument();
  expect(screen.getByText('ต้องยอมรับข้อกำหนดก่อนสร้างบัญชี')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('ชื่อจริง'), 'สมศรี');
  await userEvent.type(screen.getByLabelText('นามสกุล'), 'ใจดี');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'longenough1');
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'different1');
  await userEvent.click(screen.getByRole('checkbox', { name: /ยอมรับข้อกำหนด/ }));
  await userEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีและเข้าร่วม' }));
  expect(await screen.findByText('รหัสผ่านไม่ตรงกัน')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('ยืนยันรหัสผ่าน'));
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'longenough1');
  await userEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีและเข้าร่วม' }));
  expect(await screen.findByRole('heading', { name: 'หน้าแรกของฉัน' })).toBeInTheDocument();
});

test('0.3 ลิงก์ไม่มีอยู่: แจ้งข้อผิดพลาด ไม่สร้างบัญชี มีทางไปหน้าล็อกอิน', async () => {
  window.location.hash = '#/invite/ไม่มี';
  render(<App />);
  // ตัวอักษรไทยไม่ผ่านรูปโทเค็น -> เส้นทางไม่รู้จัก -> หน้าล็อกอิน
  expect(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้')).toBeInTheDocument();
  window.location.hash = '#/invite/zzz-not-real';
  expect(await screen.findByText(/ไม่พบคำเชิญนี้/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'ไปหน้าเข้าสู่ระบบ' }));
  expect(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้')).toBeInTheDocument();
});
