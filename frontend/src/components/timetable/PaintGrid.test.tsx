import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { axe } from 'vitest-axe';
import type { Cell } from '../../api/setup';
import PaintGrid from './PaintGrid';

const periods = [1, 2, 3].map((no) => ({ no, from: `0${7 + no}:00`, to: `0${8 + no}:00` }));
function Host() {
  const [v, setV] = useState<Record<string, Cell>>({});
  return <><PaintGrid days={['จันทร์', 'อังคาร']} periods={periods} value={v} onChange={setV} /><output>{JSON.stringify(v)}</output></>;
}

test('เลือกพู่กันแล้วคลิก/ลากทาช่อง และคลิกหัวแถวทาทั้งวัน', async () => {
  const { container } = render(<Host />);
  expect(screen.getByRole('button', { name: 'จันทร์ คาบ 1 ไม่สอน' })).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'จันทร์ คาบ 1 ไม่สอน' }));
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'จันทร์ คาบ 2 ไม่สอน' }));
  fireEvent.pointerUp(window);
  expect(screen.getByRole('button', { name: 'จันทร์ คาบ 2 สอนได้' })).toBeInTheDocument();
  await userEvent.click(screen.getByText('พัก'));
  await userEvent.click(screen.getByRole('button', { name: 'ทาทั้งวันอังคาร' }));
  expect(screen.getByRole('button', { name: 'อังคาร คาบ 3 พัก' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
