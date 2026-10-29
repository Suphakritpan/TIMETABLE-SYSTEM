import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Schedule from './Schedule';
import { rememberIngestJob } from '../api/schedule';

const cls = (over = {}) => ({
  key: 'k1', code: 'ท.30000-1101', name_th: 'ภาษาไทย', kind: 'L', kind_th: 'บรรยาย', hours: 2, students_set: 'G1', groups: ['G1'], students: 30,
  day: 'จันทร์', hour: '08:00', room: 'R1', grade: 'pass', reasons: [{ th: 'ไม่ชนกับกลุ่มหรือห้องอื่น', level: 'ok' }], pinned: false, moved: false, teachers: [], ...over,
});
const view = (c = cls()) => ({
  days: ['จันทร์', 'อังคาร'], hours: ['08:00', '09:00', '10:00'], groups: ['G1'], rooms: [{ name: 'R1' }], flag: false, lunch: [], classes: [c], breaks: [],
  summary: { classes: 1, placed: 1, hard_breaks: 0, quality: 91, parts: {}, pass: 1, check: 0, fix: 0, fixed: 0, pinned: 0, moved: 0 },
  indicators: { rooms: [{ name: 'R1', type: 'lecture', pct: 10 }], groups: [{ group: 'G1', class_hours: 2, free: 8, gaps: 0, days: 1 }], teachers: [] },
});
const state = {
  id: 's1', source: 'ced.pdf', kind: 'plan', terms: [1], status: 'new', error: null, issues: [], view: null,
  settings: { term: 1, codes: [], groups: 1, students: 30, lecture_rooms: 6, lab_rooms: 10, days: ['จันทร์', 'อังคาร'], first: '08:00', last: '17:00', lunch: 'flexible', flag: true, candidates: 5, time_limit: 20, include_fix: false },
  input: { rows: 1, fix: [], per_term: { 1: 1 }, subjects: [] },
};

function mockBackend() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url === '/api/sched/from-ingest/j1') return ok({ id: 's1' });
    if (url === '/api/sched/s1') return ok(state);
    if (url === '/api/sched/s1/run') return ok({ run: 1 });
    if (url.startsWith('/api/sched/s1/events')) {
      return ok({ status: 'solved', error: null, view: view(), events: [
        { n: 0, t: 0, event: 'stage', name: 'precheck', state: 'end', tightness: 0.4, problems: [] },
        { n: 1, t: 1, event: 'candidate', seed: 1, state: 'end', status: 'solved', placed: 1, of: 1, quality: 91 }] });
    }
    if (url.startsWith('/api/sched/s1/options/')) return ok([{ day: 'อังคาร', hour: '09:00', ok: true, room: 'R1' }, { day: 'จันทร์', hour: '09:00', ok: false, why: 'ชนกับกลุ่ม' }]);
    if (url === '/api/sched/s1/move') return ok(view(cls({ day: 'อังคาร', hour: '09:00', grade: 'fixed', moved: true, pinned: true })));
    return { ok: false, status: 404, statusText: 'nf', json: async () => ({}) };
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

test('มาจากหน้าอ่านหลักสูตร -> จัดตาราง -> เห็นผล -> คลิกคาบแล้วย้ายไปช่องที่ลงได้', async () => {
  const calls = mockBackend();
  rememberIngestJob('j1');
  render(<Schedule />);
  await userEvent.click(await screen.findByRole('button', { name: 'จัดตาราง' }));
  expect(await screen.findByText('1/1')).toBeInTheDocument();
  expect(calls).toContain('POST /api/sched/s1/run');

  await userEvent.click(screen.getByTitle(/ภาษาไทย/));
  const target = await screen.findByRole('button', { name: /อังคาร 09:00 ลงได้/ });
  await userEvent.click(target);
  await waitFor(() => expect(calls).toContain('POST /api/sched/s1/move'));
  expect(await screen.findAllByText('ย้ายโดยคน')).not.toHaveLength(0);
});

test('ไม่มีงานค้าง -> ให้อัปโหลดไฟล์เอง', () => {
  mockBackend();
  render(<Schedule />);
  expect(screen.getByLabelText(/ไฟล์ JSON/)).toBeInTheDocument();
});
