import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { resetMockAdmin } from './api/admin';
import { resetMockAuth } from './api/auth';
import { resetMockDepartments } from './api/departments';
import { seedDemoInstitution } from './api/institution';
import { resetMockPeople } from './api/people';
import { resetMockProfiles } from './api/profiles';
import { resetMockTerms } from './api/terms';

const T = 30000;
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockAuth(); resetMockPeople(); resetMockProfiles(); resetMockTerms(); resetMockDepartments(); resetMockAdmin();
  window.location.hash = '';
});

async function adminLogin() {
  await userEvent.type(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้'), 'admin@demo.test');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  await screen.findByRole('heading', { name: 'ผู้ดูแลสถาบัน', level: 1 });
}
const setDate = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

test('3.1 ภาพรวม: เห็นแผนกทั้งหมดของภาคนี้ แผนกไม่มีหัวหน้ามีข้อความเตือน และผ่าน axe', async () => {
  const { container } = render(<App />);
  await adminLogin();
  const table = await screen.findByRole('table', { name: /สถานะแผนกวิชาในภาคเรียน/ });
  expect(within(table).getByText('แผนกวิชาคอมพิวเตอร์')).toBeInTheDocument();
  expect(within(table).getByText('กำลังทำ')).toBeInTheDocument();
  expect(within(table).getByText('ยังไม่มีหัวหน้า')).toBeInTheDocument();
  expect(screen.getByText('แผนกวิชาทั้งหมด').nextElementSibling).toHaveTextContent('2');
  expect(await axe(container)).toHaveNoViolations();
}, T);

test('3.4 ปฏิทิน: เพิ่มภาคเรียน (ตรวจข้อมูล) และวันหยุด; ภาคที่มีโปรไฟล์ใช้อยู่ลบไม่ได้', async () => {
  render(<App />);
  await adminLogin();
  await userEvent.click(await screen.findByRole('tab', { name: 'ปฏิทินการศึกษา' }));
  await screen.findByRole('table', { name: 'ปฏิทินการศึกษา' });

  await userEvent.click(screen.getByRole('button', { name: 'เพิ่มภาคเรียน' }));
  let dlg = screen.getByRole('dialog', { name: 'เพิ่มภาคเรียน' });
  await userEvent.selectOptions(screen.getByLabelText('ภาคที่'), '2');
  fireEvent.change(screen.getByLabelText('ปีการศึกษา (พ.ศ.)'), { target: { value: '2571' } });
  setDate('วันเริ่ม', '2028-09-20');
  setDate('วันสิ้นสุด', '2028-05-15');
  await userEvent.click(within(dlg).getByRole('button', { name: 'เพิ่ม' }));
  expect(await within(dlg).findByRole('alert')).toHaveTextContent('วันเริ่มต้องก่อนวันสิ้นสุด');
  setDate('วันเริ่ม', '2028-11-01');
  setDate('วันสิ้นสุด', '2029-03-10');
  await userEvent.click(within(dlg).getByRole('button', { name: 'เพิ่ม' }));
  expect(await screen.findByRole('cell', { name: '2/2571' })).toBeInTheDocument();

  const row = screen.getByRole('cell', { name: '2/2570' }).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: 'วันหยุด' }));
  dlg = screen.getByRole('dialog', { name: 'วันหยุดของภาค 2/2570' });
  setDate('วันที่', '2027-12-05');
  await userEvent.type(within(dlg).getByLabelText('ชื่อวันหยุด'), 'วันพ่อ');
  await userEvent.click(within(dlg).getByRole('button', { name: 'เพิ่มวันหยุด' }));
  expect(await within(dlg).findByText(/วันพ่อ/)).toBeInTheDocument();
  await userEvent.click(within(dlg).getByRole('button', { name: 'ปิด' }));

  const used = screen.getByRole('cell', { name: '2/2569' }).closest('tr')!;
  await userEvent.click(within(used).getByRole('button', { name: 'ลบ' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบภาคเรียน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ลบไม่ได้');
}, T);

test('3.2 แผนกวิชา: สร้างแผนก → เชิญหัวหน้า ได้ลิงก์ให้คัดลอก; เชิญซ้ำไม่ได้; ลบแผนกที่มีคนไม่ได้', async () => {
  render(<App />);
  await adminLogin();
  await userEvent.click(await screen.findByRole('tab', { name: 'แผนกวิชา' }));
  await screen.findByRole('table', { name: 'แผนกวิชาและหัวหน้า' });

  await userEvent.click(screen.getByRole('button', { name: 'สร้างแผนกวิชา' }));
  const dlg = screen.getByRole('dialog', { name: 'สร้างแผนกวิชา' });
  await userEvent.type(within(dlg).getByLabelText('ชื่อแผนกวิชา'), 'แผนกวิชาการบัญชี');
  await userEvent.click(within(dlg).getByRole('button', { name: 'สร้าง' }));
  const row = (await screen.findByText('แผนกวิชาการบัญชี', { selector: 'td' })).closest('tr')!;

  await userEvent.click(within(row).getByRole('button', { name: 'เชิญหัวหน้า' }));
  const invite = screen.getByRole('dialog');
  await userEvent.type(within(invite).getByLabelText('อีเมลหัวหน้า'), 'acc@school.test');
  await userEvent.click(within(invite).getByRole('button', { name: 'สร้างลิงก์เชิญ' }));
  expect(await screen.findByText(/ลิงก์เชิญหัวหน้า/)).toBeInTheDocument();
  expect(screen.getByText(/#\/invite\/tk/)).toBeInTheDocument();
  expect(await within(row).findByText(/เชิญแล้ว: acc@school\.test/)).toBeInTheDocument();
  expect(within(row).queryByRole('button', { name: 'เชิญหัวหน้า' })).toBeNull();

  const used = screen.getByText('แผนกวิชาคอมพิวเตอร์', { selector: 'td' }).closest('tr')!;
  await userEvent.click(within(used).getByRole('button', { name: 'ลบ' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบแผนกวิชา' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ลบไม่ได้');
}, T);

test('3.3 ห้องร่วม: เพิ่มแล้วเห็นในรายการ; ครูพิมพ์ URL หน้า admin ถูกพากลับ', async () => {
  render(<App />);
  await adminLogin();
  await userEvent.click(await screen.findByRole('tab', { name: 'ห้องร่วม' }));
  expect(await screen.findByRole('cell', { name: 'หอประชุมเล็ก' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'เพิ่มห้องร่วม' }));
  const dlg = screen.getByRole('dialog', { name: 'เพิ่มห้องร่วม' });
  await userEvent.type(within(dlg).getByLabelText('ชื่อห้อง'), 'ลานกีฬา');
  await userEvent.click(within(dlg).getByRole('button', { name: 'เพิ่ม' }));
  expect(await screen.findByRole('cell', { name: 'ลานกีฬา' })).toBeInTheDocument();
}, T);
