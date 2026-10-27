import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import TimetableGrid, { STATUS, neighbor } from './TimetableGrid';
import { DAYS, ITEMS, PERIODS } from '../../data/sample';
import type { CellStatus, ClassItem } from '../../types';

const base: ClassItem = { id: 'x', day: 1, start: 3, span: 2, code: 'ท.1', name: 'วิชา', room: 'R1', teacher: 'ครู', status: 'ok' };
const show = (items: ClassItem[], selectedId: string | null = null, onSelect = vi.fn()) =>
  render(<TimetableGrid days={DAYS} periods={PERIODS} items={items} selectedId={selectedId} onSelect={onSelect} />);

test('ทุกสถานะมีสัญลักษณ์/ข้อความ (ยกเว้น ok) และชื่อที่โปรแกรมอ่านหน้าจออ่านได้', () => {
  const statuses = Object.keys(STATUS) as CellStatus[];
  show(statuses.map((s, i) => ({ ...base, id: String(i), day: i % 5, status: s })));
  for (const s of statuses) {
    expect(screen.getAllByRole('gridcell', { name: new RegExp(STATUS[s].label) }).length).toBeGreaterThan(0);
    if (STATUS[s].mark) expect(STATUS[s].label).toBeTruthy();
  }
});

test('ชื่อช่องบอกวัน ช่วงคาบ และสถานะ', () => {
  show([{ ...base, status: 'conflict' }]);
  expect(screen.getByRole('gridcell', { name: 'อังคาร คาบ 3–4 ท.1 วิชา ชน' })).toBeInTheDocument();
});

test('คลิกเลือกช่อง และใช้คีย์บอร์ด (Enter) เลือกได้', async () => {
  const onSelect = vi.fn();
  show([base], null, onSelect);
  const cell = screen.getByRole('gridcell', { name: /ท\.1/ });
  await userEvent.click(cell);
  cell.focus();
  await userEvent.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledTimes(2);
  expect(onSelect).toHaveBeenCalledWith('x');
});

test('ช่องที่เลือกมี aria-selected', () => {
  show([base], 'x');
  expect(screen.getByRole('gridcell', { name: /ท\.1/ })).toHaveAttribute('aria-selected', 'true');
});

test('ข้อมูลตัวอย่างครบทุกแถวถูกวางในตาราง', () => {
  show(ITEMS);
  expect(screen.getAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON')).toHaveLength(ITEMS.length);
});

test('axe: โครง ARIA grid/row/gridcell ถูกต้อง', async () => {
  const { container } = show(ITEMS);
  expect(await axe(container)).toHaveNoViolations();
});

test('ลูกศรย้ายโฟกัสระหว่างช่อง (ขวา = ช่องถัดไปวันเดียวกัน, ลง = วันถัดไป) และมีจุด Tab เดียว', async () => {
  const items: ClassItem[] = [
    { ...base, id: 'a', day: 0, start: 1 },
    { ...base, id: 'b', day: 0, start: 5, code: 'ท.B' },
    { ...base, id: 'c', day: 2, start: 4, code: 'ท.C' },
  ];
  show(items);
  const cells = screen.getAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON');
  expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
  cells[0].focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('gridcell', { name: /ท.B/ })).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('gridcell', { name: /ท.C/ })).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('gridcell', { name: /ท.C/ })).toHaveFocus();
});

test('neighbor: ขึ้น/ซ้ายที่ขอบ = null', () => {
  const items: ClassItem[] = [{ ...base, id: 'a', day: 0, start: 1 }];
  expect(neighbor(items, items[0], 'ArrowUp')).toBeNull();
  expect(neighbor(items, items[0], 'ArrowLeft')).toBeNull();
  expect(neighbor(items, items[0], 'Enter')).toBeNull();
});
