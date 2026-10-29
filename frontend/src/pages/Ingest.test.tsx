import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ingest from './Ingest';

const row = (over = {}) => ({
  i: 0, grade: 'fix', code: '30000-1101', name_th: 'ภาษาไทย', lecture: 1, lab: 2, credits: null, kind: 'course',
  plan: 'p', year: 1, term: 1, reasons: [{ th: 'หน่วยกิตไม่ตรงกฎ', level: 'red' }], ...over,
});
const summary = (fix: number, fixed: number) => ({ usable_pct: 90, rows: 1, pages: 3, pages_ocr: 0, totals_ok: 1, totals_all: 1, pass: 0, check: 0, fix, unknown: 0, fixed });

function mockBackend() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url === '/api/samples') return ok([{ id: 's1', label: 'ตัวอย่าง CED' }]);
    if (url === '/api/read/sample/s1') return ok({ id: 'j1' });
    if (url.startsWith('/api/jobs/j1?')) {
      return ok({ id: 'j1', file: 'ced.pdf', status: 'done', error: null, queued_behind: 0, seconds: null,
        events: [{ n: 0, t: 0, event: 'stage', name: 'check', state: 'start' }, { n: 1, t: 1, event: 'stage', name: 'check', state: 'end' }],
        result: { kind: 'plan', format_name: 'fmt', file_type_th: 'PDF', seconds: 1.2, summary: summary(1, 0), rows: [row()], file_checks: [] } });
    }
    if (url === '/api/jobs/j1/rows/0') return ok({ row: row({ grade: 'fixed', credits: 2, reasons: [{ th: 'แก้โดยคน', level: 'person' }] }), summary: summary(0, 1) });
    return { ok: false, status: 404, statusText: 'nf', json: async () => ({}) };
  }));
  return calls;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test('เลือกไฟล์ตัวอย่าง -> เห็นผลเกรด -> แก้แถวแล้วเกรดเป็น "แก้โดยคน"', async () => {
  const calls = mockBackend();
  render(<Ingest />);
  await userEvent.click(await screen.findByRole('button', { name: 'ตัวอย่าง CED' }));
  expect(await screen.findByText('ภาษาไทย')).toBeInTheDocument();
  expect(screen.getByText('หน่วยกิตไม่ตรงกฎ')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
  await userEvent.type(screen.getByLabelText('นก.'), '2');
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

  await waitFor(() => expect(screen.queryByText('หน่วยกิตไม่ตรงกฎ')).not.toBeInTheDocument());
  expect(screen.getAllByText('แก้โดยคน').length).toBeGreaterThan(1);
  expect(calls).toContain('PUT /api/jobs/j1/rows/0');
});

test('backend ปิดอยู่ -> แจ้งข้อความที่บอกวิธีแก้ ไม่พัง', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url === '/api/samples') return { ok: true, json: async () => [{ id: 's1', label: 'x' }] }; throw new TypeError('down'); }));
  render(<Ingest />);
  await userEvent.click(await screen.findByRole('button', { name: 'x' }));
  expect(await screen.findByText(/docker compose/)).toBeInTheDocument();
});

test('ขาดการเชื่อมต่อชั่วคราวระหว่าง poll -> ถามต่อจนได้ผล (ไม่ค้างตลอดไป)', async () => {
  const calls = mockBackend();
  const inner = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<unknown>;
  let failed = false;
  vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
    if (u.startsWith('/api/jobs/j1?') && !failed) { failed = true; throw new TypeError('blip'); }
    return inner(u, i);
  }));
  render(<Ingest />);
  await userEvent.click(await screen.findByRole('button', { name: 'ตัวอย่าง CED' }));
  expect(await screen.findByText('ภาษาไทย')).toBeInTheDocument();
  expect(failed).toBe(true);
  expect(calls.length).toBeGreaterThan(0);
});

test('reload หน้า -> กลับมาที่งานเดิมโดยไม่ต้องอัปโหลดใหม่', async () => {
  const calls = mockBackend();
  const first = render(<Ingest />);
  await userEvent.click(await screen.findByRole('button', { name: 'ตัวอย่าง CED' }));
  expect(await screen.findByText('ภาษาไทย')).toBeInTheDocument();
  first.unmount();                       // = reload: state หาย แต่ localStorage ยังอยู่

  calls.length = 0;
  render(<Ingest />);
  expect(await screen.findByText('ภาษาไทย')).toBeInTheDocument();
  expect(calls.some((c) => c.startsWith('POST /api/read'))).toBe(false);
});

test('งานที่จำไว้หายไปจาก backend -> กลับหน้าอัปโหลดพร้อมข้อความ', async () => {
  localStorage.setItem('ingest.job', 'gone');
  mockBackend();                         // ไม่มีงาน "gone" -> 404
  render(<Ingest />);
  expect(await screen.findByText(/หายไปเพราะเซิร์ฟเวอร์เริ่มใหม่/)).toBeInTheDocument();
  expect(screen.getByLabelText('เลือกไฟล์')).toBeInTheDocument();
  expect(localStorage.getItem('ingest.job')).toBeNull();
});
