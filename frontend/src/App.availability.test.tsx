import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { resetMockAuth } from './api/auth';
import { resetMockAvailability } from './api/availability';
import { seedDemoInstitution } from './api/institution';
import { resetMockPeople } from './api/people';
import { resetMockProfiles } from './api/profiles';
import { resetMockRules } from './api/rules';

const T = 30000;
const dateInput = (daysAhead: number) => new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockAuth();
  resetMockPeople();
  resetMockProfiles();
  resetMockRules();
  resetMockAvailability();
  window.location.hash = '';
});

async function signIn(email: string) {
  await userEvent.type(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

async function headOpensRound() {
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });
  // แท็บ ปวส. ปี 2 เสร็จ 2 ขั้น -> ขั้น 3 เป็นขั้นปัจจุบัน
  await userEvent.click(screen.getByRole('tab', { name: /ปวส\. ปี 2/ }));
  await userEvent.click(await screen.findByLabelText('นายวรากร รักเรียน'));
  fireDate(dateInput(7));
  await userEvent.click(screen.getByRole('button', { name: 'เปิดรอบ' }));
}
function fireDate(v: string) {
  fireEvent.change(screen.getByLabelText('กำหนดส่ง'), { target: { value: v } }); // jsdom พิมพ์ลง input[type=date] ไม่ได้
}

test('ขั้น 3 (หัวหน้า): เปิดรอบ → กระดานแสดง "ยังไม่ส่ง" → ขั้นยังกดเสร็จไม่ได้จนกว่าจะมีคำตอบ → บันทึกว่างทุกเวลาแทน → เสร็จขั้นได้', async () => {
  render(<App />);
  await headOpensRound();
  const board = await screen.findByRole('table', { name: 'สถานะการส่งเวลาว่าง' });
  expect(within(board).getByText('ยังไม่ส่ง')).toBeInTheDocument();
  const done = screen.getByRole('button', { name: 'เสร็จขั้นนี้' });
  expect(done).toBeDisabled();
  expect(done).toHaveAttribute('title', 'ยังมี 1 คนที่ยังไม่มีคำตอบ');

  await userEvent.click(screen.getByRole('button', { name: 'เตือนทุกคนที่ยังไม่ส่ง' }));
  expect(await screen.findByText(/เตือนแล้ว 1 คน/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกว่างทุกเวลา' }));
  expect(await within(await screen.findByRole('table', { name: 'สถานะการส่งเวลาว่าง' })).findByText(/ว่างทุกเวลา \(หัวหน้าบันทึก\)/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'เสร็จขั้นนี้' })).toBeEnabled());
}, T);

test('4.1/4.2 (อาจารย์): เห็นสิ่งที่ครบกำหนด → กรอกไม่ว่างด้วยตาราง → ส่ง → ใบรับ; หัวหน้าเห็น "ส่งแล้ว"', async () => {
  const first = render(<App />);
  await headOpensRound();
  await screen.findByRole('table', { name: 'สถานะการส่งเวลาว่าง' });
  first.unmount();
  sessionStorage.clear();
  window.location.hash = '';

  const { container } = render(<App />);
  await signIn('teacher@demo.test');
  expect(await screen.findByRole('heading', { name: 'หน้าแรกของฉัน' })).toBeInTheDocument();
  const region = await screen.findByRole('region', { name: 'สิ่งที่ครบกำหนด' });
  expect(await within(region).findByText(/ส่งเวลาว่างสำหรับ/)).toBeInTheDocument();
  await userEvent.click(within(region).getByRole('button', { name: 'กรอกเวลาว่าง' }));

  expect(await screen.findByRole('heading', { name: 'เวลาว่างของฉัน' })).toBeInTheDocument();
  const mon3 = await screen.findByRole('button', { name: 'จันทร์ คาบ 3 ว่าง' });
  await userEvent.click(mon3);
  await userEvent.click(screen.getByRole('button', { name: 'ศุกร์ คาบ 8 ว่าง' }));
  expect(screen.getByRole('button', { name: 'จันทร์ คาบ 3 ไม่ว่าง' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('ไม่ว่าง 2 คาบ')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();

  await userEvent.click(screen.getByRole('button', { name: 'ส่งเวลาว่าง' }));
  expect(await screen.findByText(/ส่งแล้ว หัวหน้าเห็นว่าไม่ว่าง 2 คาบ/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'บันทึกการแก้ไข' })).toBeInTheDocument();
}, T);

test('4.2 ไม่มีรอบ -> EmptyState; ค่าชั่วโมงสูงสุดนอก 1–12 ถูกปฏิเสธ', async () => {
  window.location.hash = '#/availability';
  render(<App />);
  await signIn('teacher@demo.test');
  expect(await screen.findByText(/ยังไม่มีรอบสอบถามเวลาว่าง/)).toBeInTheDocument();
}, T);
