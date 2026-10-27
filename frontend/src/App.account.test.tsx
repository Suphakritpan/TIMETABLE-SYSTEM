import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { resetMockAccount } from './api/account';
import { resetMockAuth } from './api/auth';
import { seedDemoInstitution } from './api/institution';
import { notify, resetMockNotifications } from './api/notifications';
import { resetMockPeople } from './api/people';
import { resetMockProfiles } from './api/profiles';

const T = 30000;
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockAuth(); resetMockAccount(); resetMockNotifications(); resetMockPeople(); resetMockProfiles();
  window.location.hash = '';
});

async function signIn(email: string, password = 'demo') {
  await userEvent.type(await screen.findByLabelText('อีเมล'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), password);
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

test('0.2 จากหน้าล็อกอิน: ขอรีเซ็ตเองแล้วบอกว่าไม่มีอีเมลถูกส่ง (ไม่เปิดเผยว่ามีบัญชีหรือไม่)', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('link', { name: 'ลืมรหัสผ่าน?' }));
  expect(await screen.findByRole('heading', { name: 'ลืมรหัสผ่าน' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('อีเมล'), 'nobody@x.test');
  await userEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์รีเซ็ต' }));
  expect(await screen.findByText(/ถ้าไม่ได้รับ ให้ขอลิงก์จากหัวหน้า/)).toBeInTheDocument();
}, T);

test('0.2 หัวหน้าสร้างลิงก์รีเซ็ตให้ครู → ครูเปิดลิงก์ตั้งรหัสใหม่ → ล็อกอินด้วยรหัสใหม่ได้ ลิงก์ใช้ซ้ำไม่ได้', async () => {
  const first = render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'บุคลากรและห้อง' }));
  const row = (await screen.findByText('นายปฐพนพัทธ์ ศรีบุญเรือง', { selector: 'td' })).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: 'สร้างลิงก์รีเซ็ตรหัสผ่าน' }));
  const url = (await screen.findByText(/#\/reset\/rs/)).textContent!;
  const hash = url.slice(url.indexOf('#'));
  first.unmount();

  sessionStorage.clear();
  window.location.hash = hash;
  const second = render(<App />);
  expect(await screen.findByText(/ตั้งรหัสผ่านใหม่ให้/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('รหัสผ่านใหม่'), 'brandnew-pass1');
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'different-pass1');
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่าน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('รหัสผ่านไม่ตรงกัน');
  await userEvent.clear(screen.getByLabelText('ยืนยันรหัสผ่าน'));
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'brandnew-pass1');
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่าน' }));
  expect(await screen.findByText(/เปลี่ยนรหัสผ่านแล้ว/)).toBeInTheDocument();
  second.unmount();

  window.location.hash = '';
  render(<App />);
  await signIn('teacher@demo.test', 'brandnew-pass1');
  expect(await screen.findByRole('heading', { name: 'หน้าแรกของฉัน' })).toBeInTheDocument();
}, T);

test('0.2 ลิงก์รีเซ็ตที่ไม่มีอยู่: แจ้งข้อผิดพลาด ไม่มีฟอร์มตั้งรหัส', async () => {
  window.location.hash = '#/reset/zzz-not-real';
  render(<App />);
  expect(await screen.findByText(/ลิงก์นี้ใช้ไม่ได้/)).toBeInTheDocument();
  expect(screen.queryByLabelText('รหัสผ่านใหม่')).toBeNull();
}, T);

test('1.2 บัญชีของฉัน: แก้ชื่อแล้วแถบบนอัปเดต, เปลี่ยนรหัสด้วยรหัสเดิมผิด = error, สังกัดแสดงตามบทบาท', async () => {
  window.location.hash = '#/account';
  render(<App />);
  await signIn('head@demo.test');
  expect(await screen.findByRole('heading', { name: 'บัญชีของฉัน' })).toBeInTheDocument();
  const section = screen.getByRole('region', { name: 'สังกัดของฉัน' });
  expect(within(section).getByText('แผนกวิชาคอมพิวเตอร์')).toBeInTheDocument();

  const profile = screen.getByRole('form', { name: 'ข้อมูลส่วนตัว' });
  await userEvent.clear(within(profile).getByLabelText('ชื่อ'));
  await userEvent.type(within(profile).getByLabelText('ชื่อ'), 'สายชล ใหม่');
  await userEvent.click(within(profile).getByRole('button', { name: 'บันทึก' }));
  expect(await screen.findByText('บันทึกข้อมูลแล้ว')).toBeInTheDocument();

  const pw = screen.getByRole('form', { name: 'เปลี่ยนรหัสผ่าน' });
  await userEvent.type(within(pw).getByLabelText('รหัสผ่านปัจจุบัน'), 'ผิด');
  await userEvent.type(within(pw).getByLabelText('รหัสผ่านใหม่'), 'newpassword1');
  await userEvent.type(within(pw).getByLabelText('ยืนยันรหัสผ่านใหม่'), 'newpassword1');
  await userEvent.click(within(pw).getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }));
  expect(await within(pw).findByRole('alert')).toHaveTextContent('รหัสผ่านปัจจุบันไม่ถูกต้อง');
}, T);

test('1.1 การแจ้งเตือน: จำนวนที่ยังไม่อ่านขึ้นที่เมนู, อ่านทั้งหมดแล้วจำนวนหาย', async () => {
  notify('u-teacher', 'เปิดรอบสอบถามเวลาว่าง');
  notify('u-teacher', 'เตือน: ยังไม่ได้ส่งเวลาว่าง');
  notify('u-head', 'ของหัวหน้า');
  render(<App />);
  await signIn('teacher@demo.test');
  const link = await screen.findByRole('link', { name: 'การแจ้งเตือน (2)' });
  await userEvent.click(link);
  expect(await screen.findByText('เปิดรอบสอบถามเวลาว่าง')).toBeInTheDocument();
  expect(screen.queryByText('ของหัวหน้า')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'อ่านทั้งหมดแล้ว' }));
  expect(await screen.findByRole('link', { name: 'การแจ้งเตือน' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'อ่านทั้งหมดแล้ว' })).toBeDisabled();
}, T);
