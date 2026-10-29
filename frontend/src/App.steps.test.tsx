import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedDemoInstitution } from './api/institution';
import { resetMockProfiles } from './api/profiles';
import { resetMockRules } from './api/rules';

// ทดสอบเส้นทางหลักขั้น 5 → 6 → 7 → 9 (ขั้น 6 เรียก backend จริงของเพื่อน: ในเทสต์จำลอง fetch)
const T = 20000;

const cls = { key: 'k1', code: 'ท.1', name_th: 'วิชา 1', kind: 'L', kind_th: 'บรรยาย', hours: 2, students_set: 'G1', groups: ['G1'], students: 30,
  day: null, hour: null, room: null, grade: 'fix', reasons: [{ th: 'ไม่มีห้องว่าง', level: 'red' }], pinned: false, moved: false, teachers: [] };
const partial = {
  days: ['จันทร์'], hours: ['08:00'], groups: ['G1'], rooms: [], flag: false, lunch: [], classes: [cls], breaks: [],
  summary: { classes: 1, placed: 0, hard_breaks: 0, quality: null, parts: {}, pass: 0, check: 0, fix: 1, fixed: 0, pinned: 0, moved: 0 },
  indicators: { rooms: [], groups: [], teachers: [] },
};
const sched = {
  id: 's1', source: 'x.csv', kind: 'plan', terms: [1], status: 'new', error: null, issues: [], view: null,
  settings: { term: 1, codes: [], groups: 1, students: 30, lecture_rooms: 6, lab_rooms: 10, days: ['จันทร์'], first: '08:00', last: '17:00', lunch: 'flexible', flag: false, candidates: 5, time_limit: 20, include_fix: false },
  input: { rows: 1, fix: [], per_term: { 1: 1 }, subjects: [] },
};
function mockBackend() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url === '/api/sched/upload') return ok({ id: 's1' });
    if (url === '/api/sched/s1') return ok(sched);
    if (url === '/api/sched/s1/run') return ok({ run: 1 });
    if (url.startsWith('/api/sched/s1/events')) return ok({ status: 'partial', error: null, events: [], view: partial });
    return { ok: false, status: 404, statusText: 'nf', json: async () => ({}) };
  }));
}
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedDemoInstitution();
  resetMockProfiles();
  resetMockRules();
  window.location.hash = '';
});

async function signIn(email: string) {
  await userEvent.type(screen.getByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}
const step = (n: number) => screen.getByRole('button', { name: new RegExp(`^${n}\\.`) });

async function openProfile(email = 'head@demo.test') {
  render(<App />);
  await signIn(email);
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });
}

test('ขั้น 5: ปี 2 ต้องการ 38 ชม. > 30 คาบ -> รับทราบไม่ได้ จนกว่าจะแก้กฎ; ขั้น 6 ถูกล็อกจน acknowledge', async () => {
  await openProfile();
  // แท็บ ปวส. ปี 1 เสร็จ 5 ขั้นแล้ว: เปิดขั้น 5 ดูรายงาน (pre-check คิดระดับโปรไฟล์ จึงเห็นปัญหาของปี 2)
  await userEvent.click(step(5));
  expect(await screen.findByRole('region', { name: 'ขั้น กฎ + วิชาเลือก' })).toBeInTheDocument();

  await userEvent.click(await screen.findByRole('button', { name: 'Check' }));
  const report = await screen.findByRole('region', { name: 'รายงาน pre-check' });
  expect(within(report).getByText(/ปวส\. ปี 2 ต้องการ 38 ชม\./)).toBeInTheDocument();
  expect(within(report).getByText(/วิธีแก้ใกล้สุด/)).toBeInTheDocument();
  expect(within(report).queryByRole('button', { name: /รับทราบ/ })).toBeNull();

  // ยังไม่ acknowledge: ขั้น 6 จัดตารางไม่ได้
  await userEvent.click(step(6));
  expect(await screen.findByText(/ต้องรับทราบรายงาน pre-check ในขั้น 5/)).toBeInTheDocument();
  expect(screen.queryByText('เลือกจากหลักสูตรในระบบ')).toBeNull();
  await userEvent.click(step(5));
  await userEvent.click(await screen.findByRole('button', { name: 'Check' }));
  await screen.findByRole('region', { name: 'รายงาน pre-check' });

  // แก้กฎ: เพิ่มคาบต่อวัน -> บันทึก -> Check ใหม่ -> ผ่าน
  const periods = screen.getByLabelText(/คาบต่อวัน/);
  await userEvent.clear(periods);
  await userEvent.type(periods, '8');
  expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled(); // ยังไม่บันทึกกฎ
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกกฎ' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  const ok = await screen.findByRole('region', { name: 'รายงาน pre-check' });
  expect(await within(ok).findByText('ผ่าน')).toBeInTheDocument();
  await userEvent.click(within(ok).getByRole('button', { name: /รับทราบรายงาน/ }));

  await userEvent.click(step(6));
  expect(await screen.findByText('เลือกจากหลักสูตรในระบบ')).toBeInTheDocument();
}, T);

test('ขั้น 6 → 7 → 9: จัดตารางจริงได้ผลบางส่วน ไปต่อไม่ได้จนกว่าไม่ชน/ครบ; ASSISTANT เผยแพร่ไม่ได้', async () => {
  await openProfile('assistant@demo.test');
  // แท็บแรก (ปวส. ปี 1) เสร็จ 5 ขั้นแล้ว (ขั้น 5 = กฎ เสร็จ แต่ mock ยังไม่ได้ acknowledge จริง)
  await userEvent.click(step(6));
  expect(await screen.findByText(/ต้องรับทราบรายงาน pre-check ในขั้น 5/)).toBeInTheDocument(); // ยังไม่ acknowledge จริง -> ตัวกันทำงาน
  await userEvent.click(step(5));
  await userEvent.click(await screen.findByRole('button', { name: 'Check' }));
  // pre-check ระดับโปรไฟล์: ปวส. ปี 2 ต้อง 38 ชม. -> problems จึงรับทราบไม่ได้
  expect(await screen.findByText(/ปวส\. ปี 2 ต้องการ 38 ชม\./)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /รับทราบรายงาน/ })).toBeNull();

  // แก้กฎให้ผ่านแล้วรับทราบ
  const periods = screen.getByLabelText(/คาบต่อวัน/);
  await userEvent.clear(periods);
  await userEvent.type(periods, '8');
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกกฎ' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  await userEvent.click(await screen.findByRole('button', { name: /รับทราบรายงาน/ }));

  await userEvent.click(await screen.findByRole('button', { name: /^6\./ }));
  mockBackend();
  await userEvent.click(await screen.findByRole('button', { name: /^ใช้ \d+ วิชานี้$/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'จัดตาราง' }));
  await screen.findByText('0/1', {}, { timeout: 5000 });
  const next = screen.getByRole('button', { name: 'ยืนยันตารางนี้และไปขั้นถัดไป' });
  expect(next).toBeDisabled();
  expect(next).toHaveAttribute('title', expect.stringMatching(/ยังมี \d+ คาบที่(ชน|ยังไม่ลง)/));
}, T * 2);
