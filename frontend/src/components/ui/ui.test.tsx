import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import Badge from './Badge';
import Button from './Button';
import EmptyState from './EmptyState';
import InlineAlert from './InlineAlert';
import Skeleton from './Skeleton';

test('Button: คลิกได้, disabled คลิกไม่ได้, ไม่ส่งฟอร์มโดยไม่ตั้งใจ (type=button)', async () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>บันทึก</Button>);
  const b = screen.getByRole('button', { name: 'บันทึก' });
  expect(b).toHaveAttribute('type', 'button');
  await userEvent.click(b);
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<Button onClick={onClick} disabled title="ยังมีแถวแดง">บันทึก</Button>);
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('Badge: สถานะมีไอคอน+ข้อความ ไม่ใช้สีอย่างเดียว', () => {
  render(<Badge tone="error">ชน 1 คาบ</Badge>);
  expect(screen.getByText('✕')).toBeInTheDocument();
  expect(screen.getByText(/ชน 1 คาบ/)).toBeInTheDocument();
});

test('InlineAlert: error ใช้ role=alert, ชนิดอื่นใช้ status', () => {
  const { rerender } = render(<InlineAlert tone="error">พัง</InlineAlert>);
  expect(screen.getByRole('alert')).toHaveTextContent('พัง');
  rerender(<InlineAlert tone="info">แจ้ง</InlineAlert>);
  expect(screen.getByRole('status')).toHaveTextContent('แจ้ง');
});

test('Skeleton: บอกโปรแกรมอ่านหน้าจอว่ากำลังโหลด', () => {
  render(<Skeleton label="กำลังโหลดตาราง" />);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('กำลังโหลดตาราง')).toBeInTheDocument();
});

test('axe: ไม่พบข้อผิดของคอมโพเนนต์พื้นฐาน', async () => {
  const { container } = render(
    <main>
      <Button variant="primary">ตกลง</Button>
      <Badge tone="success">เผยแพร่แล้ว</Badge>
      <InlineAlert tone="warning">ล้าสมัย</InlineAlert>
      <EmptyState>ยังไม่มีโปรไฟล์</EmptyState>
      <Skeleton />
    </main>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
