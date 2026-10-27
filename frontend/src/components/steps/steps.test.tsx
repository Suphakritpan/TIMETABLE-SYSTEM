import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { resetMockProfiles, getProfile } from '../../api/profiles';
import { saveLastRun, type UiRun } from '../../api/runs';
import type { ClassItem, Profile, Role } from '../../types';
import { ToastProvider } from '../ui/Toast';
import AssignStep from './AssignStep';
import PublishStep from './PublishStep';
import type { StepProps } from './types';

const item = (id: string, over: Partial<ClassItem>): ClassItem => ({
  id, day: 0, start: 1, span: 2, code: `ท.${id}`, name: `วิชา ${id}`, room: `R${id}`, teacher: `ครู${id}`, status: 'ok', ...over,
});
const run = (placed: ClassItem[]): UiRun => ({ status: 'ok', score: 90, placed, unplaced: [] });

let profile: Profile;
beforeEach(async () => {
  sessionStorage.clear();
  resetMockProfiles();
  profile = await getProfile('p1');
});

const props = (over: Partial<StepProps> = {}): StepProps => ({
  profile, yearPlanId: profile.year_plans[0].id, done: false, locked: false, role: 'HEAD' as Role,
  onComplete: vi.fn().mockResolvedValue(undefined), onProfile: vi.fn(), setStatus: vi.fn(), ...over,
});
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ขั้น 7 ห้อง + อาจารย์', () => {
  test('ไม่มีตารางจากขั้น 6 -> บอกให้กลับไปสร้าง', () => {
    wrap(<AssignStep {...props()} />);
    expect(screen.getByText(/ยังไม่มีตารางจากขั้น 6/)).toBeInTheDocument();
  });

  test('ครูซ้อนกัน -> แถวมีเหตุผล + ปุ่มยืนยันถูกปิดพร้อมบอกจำนวน; ย้ายห้อง/ครูให้ไม่ซ้อนแล้วปุ่มเปิด', async () => {
    saveLastRun(profile.id, run([item('a', { teacher: 'ไมตรี', room: 'COM602' }), item('b', { teacher: 'ไมตรี', room: 'COM603', start: 2 })]));
    const onComplete = vi.fn().mockResolvedValue(undefined);
    wrap(<AssignStep {...props({ onComplete })} />);
    expect(screen.getAllByText(/ครู ไมตรี ซ้อนกับ/, { selector: 'td' })).toHaveLength(2);
    const btn = screen.getByRole('button', { name: 'ยืนยันห้องและอาจารย์' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'ยังมี 2 คาบที่ชน');
  });

  test('เลือกห้องซ้ำกับอีกคาบที่เวลาทับกัน -> ชนห้องทันที (ตรวจสด) และบันทึกผลไว้', async () => {
    saveLastRun(profile.id, run([item('a', { room: 'COM602' }), item('b', { room: 'COM603', start: 2 })]));
    wrap(<AssignStep {...props()} />);
    expect(screen.getByRole('button', { name: 'ยืนยันห้องและอาจารย์' })).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText('ห้องของ ท.b'), 'COM602');
    expect(screen.getAllByText(/ห้อง COM602 ซ้อนกับ/, { selector: 'td' }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'ยืนยันห้องและอาจารย์' })).toBeDisabled();
  });

  test('ผ่าน -> กดยืนยันเรียก onComplete; axe ไม่พบข้อผิด', async () => {
    saveLastRun(profile.id, run([item('a', {}), item('b', { day: 1 })]));
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const { container } = wrap(<AssignStep {...props({ onComplete })} />);
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยันห้องและอาจารย์' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ขั้น 9 เผยแพร่ + พิมพ์', () => {
  beforeEach(() => saveLastRun(profile.id, run([item('a', { teacher: 'ไมตรี', room: 'COM602' }), item('b', { day: 1, teacher: 'ลี', room: 'COM603' })])));

  test('ASSISTANT: ปุ่มเผยแพร่ปิด พร้อมเหตุผล HEAD_ONLY', () => {
    wrap(<PublishStep {...props({ role: 'ASSISTANT' })} />);
    const b = screen.getByRole('button', { name: 'เผยแพร่' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('title', expect.stringContaining('HEAD_ONLY'));
  });

  test('HEAD: ต้องยืนยันก่อน แล้ว API ปฏิเสธเมื่อยังทำขั้น 1–8 ไม่ครบ (STEP_INCOMPLETE) แสดงเป็น Toast ผิดพลาด', async () => {
    wrap(<PublishStep {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: 'เผยแพร่' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'เผยแพร่ตาราง' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ยังทำไม่ครบขั้น 1–8');
  });

  test('เลือกพิมพ์ตามครู: ตัวอย่างเหลือเฉพาะคาบของครูคนนั้น', async () => {
    wrap(<PublishStep {...props()} />);
    const sheet = () => screen.getByRole('region', { name: 'ตัวอย่างที่จะพิมพ์' });
    expect(within(sheet()).getAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON')).toHaveLength(2);
    await userEvent.selectOptions(screen.getByLabelText('พิมพ์ตาม'), 'teacher');
    await userEvent.selectOptions(screen.getAllByLabelText('เลือก')[0], 'ลี');
    expect(within(sheet()).getAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON')).toHaveLength(1);
    expect(within(sheet()).getByRole('heading')).toHaveTextContent('· ลี');
  });

  test('เวอร์ชันที่เผยแพร่แล้ว: แสดงล็อก ไม่มีปุ่มเผยแพร่', () => {
    wrap(<PublishStep {...props({ profile: { ...profile, status: 'published' }, locked: true })} />);
    expect(screen.getByText(/เผยแพร่แล้ว เวอร์ชันนี้ถูกล็อก/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เผยแพร่' })).toBeNull();
  });
});
