import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ConfirmDialog from './ConfirmDialog';
import DataTable, { type Column } from './DataTable';
import Dialog from './Dialog';
import { SelectField, TextField } from './Field';
import Tabs from './Tabs';
import { ToastProvider, useToast } from './Toast';
import Button from './Button';

test('TextField: label ผูกช่อง, error มีข้อความ+aria-invalid+aria-describedby', () => {
  render(<TextField label="ชื่อโปรไฟล์" error="กรอกชื่อ" />);
  const input = screen.getByLabelText('ชื่อโปรไฟล์');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('กรอกชื่อ');
});

test('SelectField: เลือกค่าได้', async () => {
  render(<SelectField label="ภาคเรียน" defaultValue=""><option value="">เลือก</option><option value="1">1/2569</option></SelectField>);
  await userEvent.selectOptions(screen.getByLabelText('ภาคเรียน'), '1');
  expect(screen.getByLabelText('ภาคเรียน')).toHaveValue('1');
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>เปิด</Button>
      <Dialog open={open} title="ตั้งชื่อ" onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>เสร็จ</Button>}>
        <TextField label="ชื่อ" />
      </Dialog>
    </>
  );
}

test('Dialog: เปิดแล้วโฟกัสเข้า dialog, Esc ปิด, โฟกัสกลับปุ่มที่เปิด, Tab วนใน dialog', async () => {
  render(<DialogHarness />);
  await userEvent.click(screen.getByRole('button', { name: 'เปิด' }));
  const dlg = screen.getByRole('dialog', { name: 'ตั้งชื่อ' });
  expect(within(dlg).getByLabelText('ชื่อ')).toHaveFocus();
  await userEvent.tab();
  expect(within(dlg).getByRole('button', { name: 'เสร็จ' })).toHaveFocus();
  await userEvent.tab();
  expect(within(dlg).getByLabelText('ชื่อ')).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'เปิด' })).toHaveFocus();
});

test('ConfirmDialog: ปุ่มยืนยันใช้คำกริยาเฉพาะ และเรียก onConfirm / onCancel', async () => {
  const onConfirm = vi.fn(), onCancel = vi.fn();
  render(<ConfirmDialog open title="เผยแพร่" confirmLabel="เผยแพร่ตาราง" onConfirm={onConfirm} onCancel={onCancel}>ล็อกเวอร์ชันนี้</ConfirmDialog>);
  await userEvent.click(screen.getByRole('button', { name: 'เผยแพร่ตาราง' }));
  await userEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

function ToastHarness({ undo }: { undo?: () => void }) {
  const t = useToast();
  return (
    <>
      <Button onClick={() => t.show('บันทึกแล้ว', { undo })}>ok</Button>
      <Button onClick={() => t.show('ล้มเหลว', { tone: 'error' })}>bad</Button>
    </>
  );
}

test('Toast: success หายเอง, error ค้างจนกดปิด, undo เรียกฟังก์ชัน', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const undo = vi.fn();
  render(<ToastProvider><ToastHarness undo={undo} /></ToastProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'ok' }));
  await userEvent.click(screen.getByRole('button', { name: 'bad' }));
  expect(screen.getByRole('status')).toHaveTextContent('บันทึกแล้ว');
  await userEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));
  expect(undo).toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(9000); });
  expect(screen.getByRole('alert')).toHaveTextContent('ล้มเหลว');
  await userEvent.click(screen.getByRole('button', { name: 'ปิดข้อความ' }));
  expect(screen.queryByRole('alert')).toBeNull();
  vi.useRealTimers();
});

test('Tabs: ลูกศรเลื่อนแท็บและโฟกัสตาม, มีแท็บเดียวที่ tabIndex=0', async () => {
  function H() {
    const [v, setV] = useState('a');
    return <Tabs label="ชั้นปี" value={v} onChange={setV} tabs={[{ key: 'a', label: 'ปี 1' }, { key: 'b', label: 'ปี 2' }]}>เนื้อหา {v}</Tabs>;
  }
  render(<H />);
  const t1 = screen.getByRole('tab', { name: 'ปี 1' });
  t1.focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'ปี 2' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'ปี 2' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('เนื้อหา b');
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'ปี 1' })).toHaveFocus();
});

interface Row { id: string; name: string; hours: number; bad?: string }
const cols: Column<Row>[] = [
  { key: 'name', header: 'ชื่อ', render: (r) => r.name, sortValue: (r) => r.name },
  { key: 'hours', header: 'ชั่วโมง', render: (r) => r.hours, sortValue: (r) => r.hours, align: 'right' },
];
const rows: Row[] = [{ id: '1', name: 'ข', hours: 10 }, { id: '2', name: 'ก', hours: 2, bad: 'ไม่มีห้อง' }, { id: '3', name: 'ค', hours: 5 }];

test('DataTable: เรียงตัวเลขจากน้อยไปมาก > มากไปน้อย > กลับค่าเดิม และตั้ง aria-sort', async () => {
  render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="รายวิชา" />);
  const order = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent);
  const head = screen.getByRole('button', { name: /ชั่วโมง/ });
  expect(order()).toEqual(['10', '2', '5']);
  await userEvent.click(head);
  expect(order()).toEqual(['2', '5', '10']);
  expect(screen.getByRole('columnheader', { name: /ชั่วโมง/ })).toHaveAttribute('aria-sort', 'ascending');
  await userEvent.click(head);
  expect(order()).toEqual(['10', '5', '2']);
  await userEvent.click(head);
  expect(order()).toEqual(['10', '2', '5']);
});

test('DataTable: แถวมีปัญหามีข้อความ (ไม่ใช้สีอย่างเดียว), คลิกแถวเลือกได้, ว่างแสดง EmptyState', async () => {
  const onRow = vi.fn();
  const { rerender } = render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="รายวิชา" rowProblem={(r) => r.bad ?? null} onRowClick={onRow} />);
  expect(screen.getByText('ปัญหา: ไม่มีห้อง')).toBeInTheDocument();
  await userEvent.click(screen.getByText('ค'));
  expect(onRow).toHaveBeenCalledWith(rows[2]);
  rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} caption="รายวิชา" empty="ยังไม่มีวิชา" />);
  expect(screen.getByText('ยังไม่มีวิชา')).toBeInTheDocument();
});

test('axe: Field/Tabs/DataTable', async () => {
  const { container } = render(
    <main>
      <TextField label="ชื่อ" hint="ตั้งให้จำง่าย" />
      <Tabs label="ชั้นปี" value="a" onChange={() => {}} tabs={[{ key: 'a', label: 'ปี 1' }, { key: 'b', label: 'ปี 2' }]}>x</Tabs>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="รายวิชา" rowProblem={(r) => r.bad ?? null} />
    </main>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
