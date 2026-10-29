import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import Avatar from './Avatar';
import Button from './Button';
import Card from './Card';
import PageHeader from './PageHeader';
import Pagination from './Pagination';
import ProgressBar from './ProgressBar';
import SearchInput from './SearchInput';
import StatCard from './StatCard';

test('Button loading: ปิดการกดซ้ำและบอกสถานะว่ากำลังทำงาน', async () => {
  const onClick = vi.fn();
  render(<Button loading onClick={onClick}>บันทึก</Button>);
  const b = screen.getByRole('button', { name: /บันทึก/ });
  expect(b).toBeDisabled();
  expect(b).toHaveAttribute('aria-busy', 'true');
  await userEvent.click(b);
  expect(onClick).not.toHaveBeenCalled();
});

test('Pagination: ขอบเขตหน้าปิดปุ่ม, หน้าเดียวไม่แสดง', async () => {
  const onChange = vi.fn();
  const { container, rerender } = render(<Pagination page={1} pages={3} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'ก่อนหน้า' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  expect(onChange).toHaveBeenCalledWith(2);
  rerender(<Pagination page={1} pages={1} onChange={onChange} />);
  expect(container).toBeEmptyDOMElement();
});

test('ProgressBar: ค่าถูกจำกัดในช่วง; Avatar: อักษรแรกของชื่อ', () => {
  render(<><ProgressBar value={150} max={100} label="ความคืบหน้า" /><Avatar name="  สมชาย" /></>);
  expect(screen.getByRole('progressbar', { name: 'ความคืบหน้า' })).toHaveAttribute('aria-valuenow', '100');
  expect(document.querySelector('.avatar')).toHaveTextContent('ส');
});

test('คอมโพเนนต์ใหม่ไม่มีปัญหา a11y', async () => {
  const { container } = render(
    <main>
      <PageHeader title="หน้าแรก" subtitle="ภาคเรียนนี้" actions={<Button>ใหม่</Button>} />
      <Card title="สรุป"><StatCard label="ค้าง" value={3} tone="warning" /></Card>
      <SearchInput label="ค้นหา" value="" onChange={() => {}} />
    </main>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
