import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedDemoInstitution } from './api/institution';
import { resetMockProfiles } from './api/profiles';

async function signIn(email: string) {
  await userEvent.type(screen.getByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

beforeEach(() => {
  sessionStorage.clear();
  seedDemoInstitution();
  resetMockProfiles();
  window.location.hash = '';
});

test('ยังไม่ล็อกอินเห็นหน้าล็อกอิน และรหัสผิดแสดงข้อความ', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'ระบบตารางเรียน' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('อีเมลหรือชื่อผู้ใช้'), 'head@demo.test');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'ผิด');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});

test('HEAD ล็อกอินแล้วไปหน้าแรก 2.1 และเห็นเมนูของหัวหน้า ไม่เห็นเมนูผู้ดูแล', async () => {
  render(<App />);
  await signIn('head@demo.test');
  expect(await screen.findByRole('heading', { name: 'หน้าแรก' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
  expect(nav).toHaveTextContent('โปรไฟล์');
  expect(nav).not.toHaveTextContent('ผู้ดูแลสถาบัน');
});

test('TEACHER พิมพ์ URL หน้า admin: ถูกพากลับหน้าแรกของตัวเองพร้อมข้อความ', async () => {
  window.location.hash = '#/admin';
  render(<App />);
  await signIn('teacher@demo.test');
  expect(await screen.findByRole('heading', { name: 'หน้าแรกของฉัน' })).toBeInTheDocument();
  await waitFor(() => expect(window.location.hash).toBe('#/t-home'));
});

test('ADMIN เท่านั้นเข้า admin ได้', async () => {
  render(<App />);
  await signIn('admin@demo.test');
  expect(await screen.findByRole('heading', { name: 'ผู้ดูแลสถาบัน' })).toBeInTheDocument();
});

test('หลายแผนก+ผู้ดูแล: ยังไม่เลือกไม่มีบทบาท แล้วสลับได้', async () => {
  render(<App />);
  await signIn('multi@demo.test');
  expect(await screen.findByText(/เลือกแผนกวิชาที่ต้องการใช้งาน/)).toBeInTheDocument();
  const sw = screen.getByRole('combobox');
  await userEvent.selectOptions(sw, 'แผนกวิชาไฟฟ้า');
  expect(await screen.findByRole('heading', { name: 'หน้าแรกของฉัน' })).toBeInTheDocument();
  await userEvent.selectOptions(sw, 'ผู้ดูแลสถาบัน');
  expect(await screen.findByRole('heading', { name: 'ผู้ดูแลสถาบัน', level: 1 })).toBeInTheDocument();
});

test('ออกจากระบบกลับหน้าล็อกอินและล้างเซสชัน', async () => {
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: 'ออกจากระบบ' }));
  expect(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้')).toBeInTheDocument();
  expect(sessionStorage.getItem('timetable.session')).toBeNull();
});
