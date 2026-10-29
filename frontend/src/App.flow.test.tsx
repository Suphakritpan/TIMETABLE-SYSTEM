import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { getAuditLog, getInstitution, resetMockInstitution, seedDemoInstitution } from './api/institution';
import { resetMockProfiles } from './api/profiles';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
  resetMockProfiles();
});

async function signIn(email: string) {
  await userEvent.type(screen.getByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

async function fillInstitution() {
  await userEvent.type(screen.getByLabelText('ที่ตั้ง (เลขที่ ถนน ตำบล อำเภอ)'), '1 ถ.ตัวอย่าง');
  await userEvent.click(screen.getByRole('combobox', { name: 'จังหวัด' }));
  await userEvent.click(await screen.findByRole('option', { name: 'กรุงเทพมหานคร' }));
  await userEvent.type(screen.getByLabelText('รหัสไปรษณีย์'), '10100');
  await userEvent.type(screen.getByLabelText('อีเมลสถาบัน'), 'info@school.test');
  await userEvent.type(screen.getByLabelText('เบอร์โทรสถาบัน'), '021234567');
}

test('0.0 ติดตั้งใหม่: ตรวจข้อมูลก่อนส่ง แล้วเข้าหน้าผู้ดูแล และไม่เห็นหน้านี้อีก', async () => {
  resetMockInstitution();
  const { unmount } = render(<App />);
  expect(await screen.findByRole('heading', { name: 'ตั้งค่าครั้งแรก' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }));
  expect(screen.getByText('กรอกชื่อสถาบัน')).toBeInTheDocument();
  expect(screen.getByText('เลือกจังหวัด')).toBeInTheDocument();
  expect(screen.getByText('รหัสไปรษณีย์ 5 หลัก')).toBeInTheDocument();
  expect(screen.getByText('อีเมลไม่ถูกต้อง')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('ชื่อสถาบัน'), 'วิทยาลัยทดสอบ');
  await fillInstitution();
  await userEvent.type(screen.getByLabelText('ชื่อจริง'), 'สมชาย');
  await userEvent.type(screen.getByLabelText('นามสกุล'), 'ผู้ดูแล');
  await userEvent.type(screen.getByLabelText('ชื่อผู้ใช้ (Username)'), 'first.admin');
  await userEvent.type(screen.getByLabelText('อีเมลผู้ดูแล'), 'first@school.test');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'short');
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'different');
  await userEvent.click(screen.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }));
  expect(screen.getByText('รหัสผ่านอย่างน้อย 8 ตัวอักษร', { selector: '.field-error' })).toBeInTheDocument();
  expect(screen.getByText('รหัสผ่านไม่ตรงกัน')).toBeInTheDocument();
  expect(screen.getByText('ต้องยอมรับข้อกำหนดก่อนดำเนินการต่อ')).toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText('รหัสผ่าน'));
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'longenough1');
  await userEvent.clear(screen.getByLabelText('ยืนยันรหัสผ่าน'));
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'longenough1');
  await userEvent.click(screen.getByRole('checkbox', { name: /ยอมรับข้อกำหนด/ }));
  await userEvent.click(screen.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }));
  expect(await screen.findByRole('heading', { name: 'ผู้ดูแลสถาบัน', level: 1 })).toBeInTheDocument();
  expect(getInstitution()).toMatchObject({ name: 'วิทยาลัยทดสอบ', type: 'vocational', province: 'กรุงเทพมหานคร', contact_email: 'info@school.test' });
  expect(getAuditLog()).toHaveLength(1);

  unmount();
  sessionStorage.clear();
  window.location.hash = '';
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'ระบบตารางเรียน' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'ตั้งค่าครั้งแรก' })).toBeNull();
}, 30000);

test('ล็อกอินแสดงประเภทสถานศึกษา: อาชีวะใช้งานได้ ที่เหลือเร็ว ๆ นี้', async () => {
  seedDemoInstitution();
  render(<App />);
  const list = await screen.findByRole('list', { name: 'ประเภทสถานศึกษาที่รองรับ' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(within(list).getAllByText(/เร็ว ๆ นี้/)).toHaveLength(2);
});

test('2.2 สร้างโปรไฟล์ใหม่: เข้าพื้นที่ทำงาน แท็บหลักสูตร × ชั้นปี ขั้นแรกเป็นปัจจุบัน ขั้นอื่นล็อก', async () => {
  seedDemoInstitution();
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'โปรไฟล์' }));
  expect(await screen.findByRole('button', { name: /ตารางเรียน ภาค 2\/2569/ })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'สร้างโปรไฟล์ใหม่' }));
  const dlg = screen.getByRole('dialog', { name: 'สร้างโปรไฟล์ใหม่' });
  await userEvent.click(within(dlg).getByRole('button', { name: 'สร้าง' }));
  expect(await within(dlg).findByRole('alert')).toHaveTextContent('กรอกชื่อโปรไฟล์');
  await userEvent.type(within(dlg).getByLabelText('ชื่อโปรไฟล์'), 'ภาค 1/2570');
  await userEvent.selectOptions(within(dlg).getByLabelText('ภาคเรียน'), 't-1-2570');
  await userEvent.click(within(dlg).getByRole('button', { name: 'สร้าง' }));

  expect(await screen.findByRole('heading', { name: 'ภาค 1/2570' })).toBeInTheDocument();
  expect(screen.getByText(/ภาคเรียน 1\/2570/)).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  const step = (n: number) => screen.getByRole('button', { name: new RegExp(`^${n}\\.`) });
  expect(step(1)).toHaveAttribute('aria-current', 'step');
  expect(step(2)).toHaveAttribute('aria-disabled', 'true');
  expect(step(2)).toHaveAttribute('title', 'ต้องทำขั้น "ตั้งค่า" ให้เสร็จก่อน');
});

test('กฎแถบขั้นตอน: แก้ขั้นที่เสร็จแล้วต้องยืนยันผลกระทบ แล้วขั้นหลังล้าสมัยเฉพาะแท็บนั้น', async () => {
  seedDemoInstitution();
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });

  // แท็บแรก (ปวส. ปี 1) เสร็จ 5 ขั้น: เลือกขั้น 1 แล้วแก้
  await userEvent.click(screen.getByRole('button', { name: /^1./ }));
  await userEvent.click(await screen.findByRole('button', { name: 'บันทึกการแก้ไข' }));
  const dlg = screen.getByRole('dialog');
  expect(within(dlg).getByText(/ขั้น 2: ตรวจข้อมูล/)).toBeInTheDocument();
  expect(within(dlg).getByText(/ขั้น 5: กฎ \+ วิชาเลือก/)).toBeInTheDocument();
  await userEvent.click(within(dlg).getByRole('button', { name: 'แก้ไขและทำให้ขั้นหลังล้าสมัย' }));

  expect(await screen.findByRole('button', { name: /^2..*ล้าสมัย/ })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /ปวส. ปี 1/ })).toHaveTextContent('มีขั้นล้าสมัย');
  expect(screen.getByRole('tab', { name: /ปวส. ปี 2/ })).not.toHaveTextContent('มีขั้นล้าสมัย');

  // ล้าสมัยแล้วต้องทำใหม่ตามลำดับ ข้ามไปขั้น 3 ไม่ได้
  expect(screen.getByRole('button', { name: /^3./ })).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(screen.getByRole('button', { name: /^2./ }));
  await userEvent.click(await screen.findByRole('button', { name: 'ข้อมูลพร้อม ไปขั้นถัดไป' }));
  expect(await screen.findByText('ขั้น "ตรวจข้อมูล" เสร็จแล้ว')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^3./ })).not.toHaveAttribute('aria-disabled');
});

test('2.1 หน้าแรกชี้ไปโปรไฟล์ที่ทำค้างและแสดงสิ่งที่ต้องทำ', async () => {
  seedDemoInstitution();
  render(<App />);
  await signIn('head@demo.test');
  expect(await screen.findByRole('button', { name: /ทำต่อ “ตารางเรียน ภาค 2\/2569”/ })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'สิ่งที่ต้องทำตอนนี้' })).toBeInTheDocument();
});

test('เปิดโปรไฟล์ที่ไม่มี: แจ้งไม่พบพร้อมทางกลับ', async () => {
  seedDemoInstitution();
  render(<App />);
  await signIn('head@demo.test');
  expect(await screen.findByRole('heading', { name: 'หน้าแรก' })).toBeInTheDocument();
  window.location.hash = '#/profiles/zzz';
  expect(await screen.findByText(/ไม่พบโปรไฟล์นี้/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'กลับไปรายการโปรไฟล์' }));
  expect(await screen.findByRole('heading', { name: 'โปรไฟล์' })).toBeInTheDocument();
});

test('0.0 อีเมลหรือชื่อผู้ใช้ซ้ำกับบัญชีที่มีอยู่ แสดงที่ช่องนั้น และไม่สร้างสถาบัน', async () => {
  resetMockInstitution();
  render(<App />);
  await screen.findByRole('heading', { name: 'ตั้งค่าครั้งแรก' });
  await userEvent.type(screen.getByLabelText('ชื่อสถาบัน'), 'วิทยาลัยทดสอบ');
  await fillInstitution();
  await userEvent.type(screen.getByLabelText('ชื่อจริง'), 'สมชาย');
  await userEvent.type(screen.getByLabelText('นามสกุล'), 'ผู้ดูแล');
  await userEvent.type(screen.getByLabelText('ชื่อผู้ใช้ (Username)'), 'first.admin');
  await userEvent.type(screen.getByLabelText('อีเมลผู้ดูแล'), 'head@demo.test');
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'longenough1');
  await userEvent.type(screen.getByLabelText('ยืนยันรหัสผ่าน'), 'longenough1');
  await userEvent.click(screen.getByRole('checkbox', { name: /ยอมรับข้อกำหนด/ }));
  await userEvent.click(screen.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }));
  expect(await screen.findByText('มีบัญชีใช้อีเมลนี้แล้ว', { selector: '.field-error' })).toBeInTheDocument();
  expect(getInstitution()).toBeNull();
}, 30000);

test('0.0 ผู้ดูแลคนแรกล็อกอินด้วยชื่อผู้ใช้ได้', async () => {
  const { setup } = await import('./api/institution');
  const { resetMockAuth } = await import('./api/auth');
  resetMockAuth();
  resetMockInstitution();
  await setup({ name: 'วิทยาลัยทดสอบ', type: 'vocational', language: 'th', address: 'ที่อยู่', province: 'กรุงเทพมหานคร', postcode: '10100', contact_email: 'info@school.test', contact_phone: '021234567', firstName: 'ก', lastName: 'ข', username: 'first.admin', email: 'first@school.test', password: 'longenough1' });
  const { login } = await import('./api/auth');
  await expect(login('FIRST.admin', 'longenough1')).resolves.toMatchObject({ email: 'first@school.test' });
  await expect(login('first.admin', 'wrong')).rejects.toThrow();
});
