// ชั้นผลรัน solver: mock ที่รูปตรงกับ api.md §7.1 + ตัวแปลงเป็นรูปที่ UI ใช้ (ROADMAP T2.2 / D-5)
// เมื่อมี API จริง เปลี่ยนเฉพาะ fetchRun() ตัวแปลงไม่ต้องแตะ
import { ITEMS, UNPLACED_ROWS } from '../data/sample';
import type { ClassItem, UnplacedItem } from '../types';
import { ApiException, type ApiCandidate, type ApiRun, type Directory } from './types';

export interface UiRun {
  status: 'ok' | 'partial';
  score: number;
  placed: ClassItem[];
  unplaced: UnplacedItem[];
}

/** แปลงผลรันจาก API เป็นรูป UI เลือกตัวเลือกคะแนนสูงสุด (หรือระบุ candidateId). failed -> throw พร้อมรหัส error */
export function adaptRun(run: ApiRun, dir: Directory, candidateId?: string): UiRun {
  if (run.status === 'failed') throw new ApiException(run.error ?? { code: 'SOLVER_FAILED', message: 'ตัวจัดตารางหยุด' });
  if (run.status !== 'ok' && run.status !== 'partial') throw new ApiException({ code: 'RUN_NOT_FINISHED', message: `ผลรันยังไม่เสร็จ (${run.status})` });

  const cand: ApiCandidate | undefined = candidateId
    ? run.candidates.find((c) => c.id === candidateId)
    : [...run.candidates].sort((a, b) => b.score - a.score)[0];
  if (!cand) throw new ApiException({ code: 'NO_CANDIDATE', message: 'ไม่พบตัวเลือกผลลัพธ์' });

  const conflicts = new Set(cand.conflicts ?? []);
  const row = (id: string) => dir.planRows[id] ?? { code: id, name: '(ไม่พบวิชา)' };

  return {
    status: run.status,
    score: cand.score,
    placed: cand.placed.map((p) => ({
      id: p.class_id,
      day: p.day,
      start: p.start_period,
      span: p.span,
      code: row(p.plan_row_id).code,
      name: row(p.plan_row_id).name,
      room: dir.rooms[p.room_id] ?? p.room_id,
      teacher: p.teacher_ids.map((t) => dir.teachers[t] ?? t).join(' + '),
      status: conflicts.has(p.class_id) ? 'conflict' : p.pinned ? 'pinned' : 'ok',
    })),
    unplaced: cand.unplaced.map((u) => ({
      id: u.class_id,
      code: row(u.plan_row_id).code,
      name: row(u.plan_row_id).name,
      span: row(u.plan_row_id).span ?? 1,
      reason: u.reason,
      fix: u.fix,
    })),
  };
}

// ---------- mock ฝั่ง server (สร้างจากข้อมูลตัวอย่าง ใช้แทน GET /api/runs/{id}) ----------

const slug = (prefix: string, i: number) => `${prefix}${i + 1}`;

function buildMock(): { run: ApiRun; dir: Directory } {
  const teachers: Directory['teachers'] = {};
  const rooms: Directory['rooms'] = {};
  const planRows: Directory['planRows'] = {};
  const idOf = (table: Record<string, string>, name: string, prefix: string) => {
    let id = Object.keys(table).find((k) => table[k] === name);
    if (!id) {
      id = slug(prefix, Object.keys(table).length);
      table[id] = name;
    }
    return id;
  };
  const rowOf = (code: string, name: string, span?: number) => {
    const id = `r-${code}`;
    planRows[id] = { code, name, span };
    return id;
  };

  const placed = ITEMS.map((i) => ({
    class_id: `k${i.id}`,
    plan_row_id: rowOf(i.code, i.name),
    group_id: 'g1',
    teacher_ids: i.teacher.split(' + ').map((t) => idOf(teachers, t, 'u')),
    room_id: idOf(rooms, i.room, 'rm'),
    day: i.day,
    start_period: i.start,
    span: i.span,
    pinned: i.status === 'edited',
  }));
  const unplaced = UNPLACED_ROWS.map((u, i) => ({
    class_id: `k9${i}`, plan_row_id: rowOf(u.code, u.name, u.span), reason: u.reason, fix: u.fix,
  }));

  return {
    dir: { teachers, rooms, planRows },
    run: {
      id: 'run_1',
      status: 'partial',
      progress: { stage: 'solving', percent: 100 },
      candidates: [
        { id: 'c1', score: 82, placed, unplaced, conflicts: ITEMS.filter((i) => i.status === 'conflict').map((i) => `k${i.id}`) },
        { id: 'c2', score: 74, placed: placed.slice(0, 6), unplaced },
      ],
      error: null,
    },
  };
}

const mock = buildMock();

/** แทน POST /runs + poll GET /runs/{id} */
async function fetchRun(opts: { fail: boolean }): Promise<{ run: ApiRun; dir: Directory }> {
  await new Promise((r) => setTimeout(r, 700));
  if (opts.fail) {
    return { dir: mock.dir, run: { ...mock.run, status: 'failed', candidates: [], error: { code: 'SOLVER_FAILED', message: 'ตัวจัดตารางหยุด: หมดเวลา' } } };
  }
  return mock;
}

export async function generate({ fail = false } = {}): Promise<UiRun> {
  const { run, dir } = await fetchRun({ fail });
  return adaptRun(run, dir);
}

// ---------- ผลรันล่าสุดต่อโปรไฟล์ (รีเฟรชแล้วผลไม่หาย ตาม R5/api.md §7.1 "เก็บผลดีล่าสุดไว้") ----------
// ใน API จริงอยู่ที่ backend (GET /runs) ตอนนี้ใช้ sessionStorage; อ่าน/เขียนไม่ได้ก็ทำงานต่อโดยไม่จำ
const runKey = (profileId: string) => `timetable.run.${profileId}`;

export function loadLastRun(profileId: string): UiRun | null {
  try {
    const s = sessionStorage.getItem(runKey(profileId));
    return s ? (JSON.parse(s) as UiRun) : null;
  } catch {
    return null;
  }
}

export function saveLastRun(profileId: string, run: UiRun) {
  try {
    sessionStorage.setItem(runKey(profileId), JSON.stringify(run));
  } catch { /* ใช้งานต่อโดยไม่เก็บ */ }
}
