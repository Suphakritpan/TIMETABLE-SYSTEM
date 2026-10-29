// ② จัดตาราง: client ของ backend/ (/api/sched/*, รูปแบบตาม backend/app/server.py + schedule.py view())
import { call, json } from './ingest';

export type SchedGrade = 'pass' | 'check' | 'fix' | 'fixed';
export interface SchedReason { th: string; level: 'ok' | 'red' | 'amber' | 'person' | 'info' }
export interface SchedClass {
  key: string; code: string; name_th: string; kind: string; kind_th: string; hours: number; students_set: string; groups: string[];
  students: number; day: string | null; hour: string | null; room: string | null; grade: SchedGrade;
  reasons: SchedReason[]; pinned: boolean; moved: boolean; teachers: string[];
}
export interface SchedView {
  days: string[]; hours: string[]; groups: string[]; rooms: { name: string }[]; flag: boolean;
  classes: SchedClass[]; lunch: { group: string; day: string; hour: string; key: string }[];
  summary: { classes: number; placed: number; hard_breaks: number; quality: number | null; parts: Record<string, number>; pass: number; check: number; fix: number; fixed: number; pinned: number; moved: number };
  breaks: string[];
  indicators: { rooms: { name: string; type: string; pct: number }[]; groups: { group: string; class_hours: number; free: number; gaps: number; days: number }[]; teachers: { teacher: string; hours: number; days: number; max_day: number }[] };
}
export interface SchedSettings {
  term: number; codes: string[]; groups: number; students: number; lecture_rooms: number; lab_rooms: number; days: string[];
  first: string; last: string; lunch: 'flexible' | 'fixed'; flag: boolean; candidates: number; time_limit: number; include_fix: boolean;
}
export interface SchedSubject { code: string; name_th: string | null; kind: string; lecture: number | null; lab: number | null; credits: number | null; choice?: string }
export interface TeacherFile { file: string; teachers: number; subjects: number; issues: { level: string; th: string }[]; names: string[]; uncovered: string[] }
export interface TeacherWeek { name: string; classes: SchedClass[]; hours: number; clashes: { day: string; a: string; b: string; th: string }[] }
export interface SchedState {
  id: string; source: string; kind: 'plan' | 'course_list'; terms: number[]; settings: SchedSettings; status: string; error: string | null;
  issues: { level: string; th: string }[];
  input: { rows: number; fix: { code: string; name_th: string | null }[]; per_term: Record<string, number>; subjects: SchedSubject[] };
  view: SchedView | null;
  teacher_file: TeacherFile | null;
}
export interface SchedEvent {
  n: number; t: number; event: string; name?: string; state?: string; seed?: number; status?: string; placed?: number; of?: number;
  quality?: number; breaks?: number; tightness?: number; seconds?: number; possible?: boolean; best?: number;
  problems?: { what: string; fix: string }[];
  classes?: number; hours?: number; groups?: number; lunch?: number; pins?: number; off_site?: unknown[]; left_out?: unknown[];
}
export interface SchedEvents { status: string; error: string | null; events: SchedEvent[]; view: SchedView | null }
export interface MoveOption { day: string; hour: string; ok: boolean; why?: string; room?: string | null }

const P = (sid: string) => `/api/sched/${sid}`;
export const fromIngest = (jid: string) => call<{ id: string }>(`/api/sched/from-ingest/${jid}`, { method: 'POST' });
export function uploadSched(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return call<{ id: string }>('/api/sched/upload', { method: 'POST', body: fd });
}
export const getSched = (sid: string) => call<SchedState>(P(sid));
export const runSched = (sid: string, s: SchedSettings) => call<{ run: number }>(`${P(sid)}/run`, json('POST', s));
export const getEvents = (sid: string, since: number) => call<SchedEvents>(`${P(sid)}/events?since=${since}`);
export const cancelSched = (sid: string) => call<{ status: string }>(`${P(sid)}/cancel`, { method: 'POST' });
export const moveOptions = (sid: string, key: string) => call<MoveOption[]>(`${P(sid)}/options/${encodeURIComponent(key)}`);
export const moveClass = (sid: string, key: string, day: string, hour: string) => call<SchedView>(`${P(sid)}/move`, json('POST', { key, day, hour }));
export const pinClass = (sid: string, key: string, pinned: boolean) => call<SchedView>(`${P(sid)}/pin`, json('POST', { key, pinned }));
export const setTeachers = (sid: string, key: string, names: string[]) => call<SchedView>(`${P(sid)}/teachers`, json('PUT', { key, names }));
export const teacherWeek = (sid: string, name: string) => call<TeacherWeek>(`${P(sid)}/teacher?name=${encodeURIComponent(name)}`);
export const teacherSamples = () => call<string[]>('/api/teacher-samples');
export const pickTeacherSample = (sid: string, name: string) => call<TeacherFile>(`${P(sid)}/teachers-file/sample/${encodeURIComponent(name)}`, { method: 'POST' });
export function uploadTeacherFile(sid: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return call<TeacherFile>(`${P(sid)}/teachers-file`, { method: 'POST', body: fd });
}
export const removeTeacherFile = (sid: string) => call<null>(`${P(sid)}/teachers-file`, { method: 'DELETE' });
export const schedExportUrl = (sid: string, kind: 'json' | 'csv') => `${P(sid)}/export.${kind}`;

// ส่งงานอ่านหลักสูตร (หน้า ①) ต่อให้หน้า ② ข้ามหน้าด้วย sessionStorage (เราท์ hash ไม่มีที่เก็บ id นี้)
const KEY = 'schedule.fromIngest';
export function rememberIngestJob(id: string) { try { sessionStorage.setItem(KEY, id); } catch { /* ไม่มีที่เก็บ: ผู้ใช้อัปโหลดไฟล์เองได้ */ } }
export function takeIngestJob(): string | null {
  try { const id = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return id; } catch { return null; }
}

// ---- ผลจาก backend -> รูปที่ขั้นอื่นของพื้นที่ทำงานใช้ (UiRun) ----
import type { UiRun } from './runs';
import { DAYS } from '../data/sample';

export function viewToUiRun(v: SchedView): UiRun {
  const placed = v.classes.filter((c) => c.day).map((c) => {
    const d = DAYS.indexOf(c.day as string);
    return {
      id: c.key, day: d >= 0 ? d : v.days.indexOf(c.day as string), start: v.hours.indexOf(c.hour as string) + 1, span: c.hours,
      code: c.code, name: c.name_th, room: c.room ?? '', teacher: c.teachers.join(' + '), group: c.students_set,
      status: (c.grade === 'fix' ? 'conflict' : c.pinned ? 'pinned' : c.moved ? 'edited' : 'ok') as UiRun['placed'][number]['status'],
    };
  });
  const unplaced = v.classes.filter((c) => !c.day).map((c) => ({
    id: c.key, code: c.code, name: c.name_th, span: c.hours,
    reason: c.reasons[0]?.th ?? 'ยังไม่ได้จัด', fix: 'คลิกคาบในหน้าจัดตาราง แล้วคลิกช่องสีเขียวเพื่อวาง',
  }));
  return { status: unplaced.length || v.summary.hard_breaks ? 'partial' : 'ok', score: v.summary.quality ?? 0, placed, unplaced };
}

// ---- แถววิชาจากหลักสูตรในระบบ -> CSV แม่แบบของ backend (plan,year,term,code,name_th,kind,lecture,lab,credits) ----
import type { CurriculumRow } from './structure';

const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
/** วิชาของชั้นปี y ภาค t (ช่องวิชาเลือกที่ยังไม่กำหนดวิชาข้ามไป) */
export function curriculumCsv(c: CurriculumRow, y: number, t: number): string {
  const rows = c.courses.filter((x) => x.y === y && Number(x.t) === t && x.kind !== 'elective_slot');
  return ['plan,year,term,code,name_th,kind,lecture,lab,credits',
    ...rows.map((x) => [c.plan, y, t, x.code, x.name, x.kind, x.lec, x.lab, x.cr].map(cell).join(','))].join('\n');
}
export const uploadCsv = (text: string, name: string) => uploadSched(new File(['﻿' + text], name, { type: 'text/csv' }));
