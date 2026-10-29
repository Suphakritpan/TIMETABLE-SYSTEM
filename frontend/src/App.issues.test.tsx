import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { resetMockAuth } from './api/auth';
import { resetMockAvailability } from './api/availability';
import { seedDemoInstitution } from './api/institution';
import { listIssues, resetMockIssues } from './api/issues';
import { resetMockPeople } from './api/people';
import { getProfile, resetMockProfiles } from './api/profiles';
import { resetMockRules } from './api/rules';
import IssuesStep from './components/steps/IssuesStep';
import { ToastProvider } from './components/ui/Toast';
import { SessionProvider } from './context/Session';
import type { StepProps } from './components/steps/types';
import { MOCK_USERS } from './api/auth';

const T = 30000;

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
  window.location.hash = '';
});

async function signIn(email: string) {
  await userEvent.type(await screen.findByLabelText('อีเมลหรือชื่อผู้ใช้'), email);
  await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'demo');
  await userEvent.click(screen.getByRole('combobox', { name: 'สถานศึกษา' }));
  await userEvent.click(await screen.findByRole('option', { name: 'วิทยาลัยตัวอย่าง' }));
  await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
}

test('ขั้น 4 (หัวหน้า): BLOCKER ไม่มีตัวเลือก "ยอมรับ", WARNING มี; ตัดสินต้องมีหมายเหตุ; เธรดความเห็นบันทึกได้', async () => {
  render(<App />);
  await signIn('head@demo.test');
  await userEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
  await screen.findByRole('heading', { name: 'ตารางเรียน ภาค 2/2569' });
  await userEvent.click(screen.getByRole('button', { name: /^4\./ }));

  const table = await screen.findByRole('table', { name: 'รายการปัญหาจากข้อมูลอาจารย์' });
  expect(within(table).getAllByText('BLOCKER').length).toBe(2);
  expect(screen.getByText(/ค้าง 3 จาก 3 รายการ/)).toBeInTheDocument();

  // รายการแรกเป็น BLOCKER: ไม่มีตัวเลือกยอมรับ
  const decide = screen.getByRole('group', { name: 'ตัดสินใจ' });
  expect(within(decide).queryByRole('option', { name: 'ยอมรับความเสี่ยง' })).toBeNull();
  expect(within(decide).getByRole('option', { name: 'ใช้ครูภายนอก' })).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('เขียนความเห็น'), 'ขอตรวจก่อนนะครับ');
  await userEvent.click(screen.getByRole('button', { name: 'ส่งความเห็น' }));
  expect(await screen.findByText('ขอตรวจก่อนนะครับ')).toBeInTheDocument();

  await userEvent.selectOptions(within(decide).getByLabelText('วิธีจัดการ'), 'outside_teacher');
  await userEvent.click(within(decide).getByRole('button', { name: 'บันทึกการตัดสินใจ' }));
  expect(await screen.findByText('ใส่หมายเหตุว่าทำไมจึงตัดสินใจเช่นนี้')).toBeInTheDocument();
  await userEvent.type(within(decide).getByLabelText('หมายเหตุ (ทำไม)'), 'จ้างครูพิเศษ');
  await userEvent.click(within(decide).getByRole('button', { name: 'บันทึกการตัดสินใจ' }));
  expect(await screen.findByText(/ค้าง 2 จาก 3 รายการ/)).toBeInTheDocument();
  expect((await listIssues('p1'))[0].decision).toMatchObject({ outcome: 'outside_teacher', note: 'จ้างครูพิเศษ', decided_by: 'u-head' });
}, T);

test('4.3 (ครู): เห็นเฉพาะรายการของฉัน ตอบในเธรดเดียวกับหัวหน้า แต่ตัดสินใจไม่ได้', async () => {
  render(<App />);
  await signIn('teacher@demo.test');
  await userEvent.click(await screen.findByRole('link', { name: 'รายการของฉัน' }));
  expect(await screen.findByRole('heading', { name: /ครูวรากร ถูกมอบหมายเกินชั่วโมงสูงสุดต่อวัน/ })).toBeInTheDocument();
  expect(screen.queryByText(/วิชา ป\.31901-2005 ยังไม่มีผู้สอน/)).toBeNull(); // ไม่ใช่ของฉัน
  expect(screen.queryByRole('button', { name: 'บันทึกการตัดสินใจ' })).toBeNull();

  const panel = screen.getByRole('region', { name: 'ครูวรากร ถูกมอบหมายเกินชั่วโมงสูงสุดต่อวัน' });
  await userEvent.type(within(panel).getByLabelText('เขียนความเห็น'), 'ตั้งไว้ผิด ขอแก้เป็น 8 ชม.');
  await userEvent.click(within(panel).getByRole('button', { name: 'ส่งความเห็น' }));
  expect(await within(panel).findByText('ตั้งไว้ผิด ขอแก้เป็น 8 ชม.')).toBeInTheDocument();
  expect((await listIssues('p1'))[1].comments[0]).toMatchObject({ author_id: 'u-teacher' }); // หัวหน้าเห็นเธรดเดียวกัน
}, T);

describe('IssuesStep (ขั้นยังไม่เสร็จ)', () => {
  const stepProps = async (onComplete: () => Promise<void>): Promise<StepProps> => ({
    profile: await getProfile('p1'), yearPlanId: 'x', done: false, locked: false, role: 'HEAD', onComplete, onProfile: vi.fn(), setStatus: vi.fn(),
  });
  const wrap = (ui: React.ReactElement) => render(
    <SessionProvider initial={{ user: MOCK_USERS[0], scope: {} }}><ToastProvider>{ui}</ToastProvider></SessionProvider>,
  );

  test('ปุ่ม "เสร็จขั้นนี้" ปิดจนกว่าจะตัดสินครบทุกรายการ แล้วเรียก onComplete', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const { container } = wrap(<IssuesStep {...await stepProps(onComplete)} />);
    const btn = await screen.findByRole('button', { name: 'เสร็จขั้นนี้' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'ยังมี 3 รายการที่ยังไม่ตัดสินใจ');
    expect(await axe(container)).toHaveNoViolations();

    for (let n = 0; n < 3; n++) {
      const g = await screen.findByRole('group', { name: 'ตัดสินใจ' });
      const sel = within(g).getByLabelText('วิธีจัดการ') as HTMLSelectElement;
      const options = [...sel.options].map((o) => o.value).filter(Boolean);
      await userEvent.selectOptions(sel, options.includes('accept') ? 'accept' : 'change');
      await userEvent.type(within(g).getByLabelText('หมายเหตุ (ทำไม)'), 'รับทราบ');
      await userEvent.click(within(g).getByRole('button', { name: 'บันทึกการตัดสินใจ' }));
      await screen.findByText(new RegExp(`ค้าง ${2 - n} จาก 3 รายการ`));
      // เลือกรายการค้างถัดไป
      const next = screen.queryAllByRole('row').find((r) => within(r).queryByText('ค้าง'));
      if (next) await userEvent.click(next);
    }
    const done = screen.getByRole('button', { name: 'เสร็จขั้นนี้' });
    expect(done).toBeEnabled();
    await userEvent.click(done);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  }, T);
});
