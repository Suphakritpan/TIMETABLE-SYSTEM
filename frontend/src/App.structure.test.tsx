import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { resetMockAuth } from './api/auth';
import { resetMockDepartments } from './api/departments';
import { seedDemoInstitution } from './api/institution';
import { resetMockPeople } from './api/people';

beforeEach(() => {
  sessionStorage.clear();
  seedDemoInstitution();
  resetMockAuth(); resetMockPeople(); resetMockDepartments();
  window.location.hash = '#/structure';
});

test('อาจารย์เปิดหน้าโครงสร้างได้: เห็นหลักสูตรตามชั้นปี และบุคลากรของแผนก', async () => {
  const { container } = render(<App />);
  await userEvent.type(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้'), 'teacher@demo.test');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  await screen.findByRole('heading', { name: 'โครงสร้าง', level: 1 });
  expect(await screen.findByRole('combobox', { name: 'สถานศึกษา' })).toHaveValue('chonburi');
  expect(screen.getByRole('tab', { name: 'ชั้นปีที่ 2' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'ภาคเรียนที่ 1 ชั้นปีที่ 1' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
  await userEvent.click(screen.getByRole('tab', { name: /บุคลากร/ }));
  const dept = (await screen.findByText('แผนกวิชาคอมพิวเตอร์')).closest('details')!;
  expect(within(dept).getByText('หัวหน้า')).toBeInTheDocument();
}, 30000);
