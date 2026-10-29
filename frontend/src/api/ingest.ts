// ① อ่านหลักสูตร: client ของ backend/ (FastAPI) — /api/read, /api/jobs/* (รูปแบบตาม backend/app/server.py)
// vite proxy ส่ง /api ไป backend (ดู vite.config.ts)
import { ApiException } from './types';

export type Grade = 'pass' | 'check' | 'fix' | 'unknown' | 'fixed';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'refused' | 'cancelled';

export interface IngestReason { th: string; level: 'ok' | 'red' | 'amber' | 'person' | 'info' }
export interface IngestRow {
  i: number; grade: Grade; code: string; name_th: string; kind?: string; choice?: string; group?: string;
  page?: number; plan?: string; year?: number; term?: number; lecture: number | null; lab: number | null; credits: number | null;
  reasons: IngestReason[];
}
export interface IngestSummary {
  usable_pct: number; rows: number; pages: number; pages_ocr: number; totals_ok: number; totals_all: number;
  pass: number; check: number; fix: number; unknown: number; fixed: number;
}
export interface IngestResult {
  kind: 'plan' | 'course_list'; format?: string; format_name: string; file_type_th: string; seconds: number;
  summary: IngestSummary; rows: IngestRow[]; file_checks: { level: IngestReason['level']; th: string; page?: number }[];
}
export interface IngestEvent { n: number; t: number; event: string; [k: string]: unknown }
export interface IngestJob {
  id: string; file: string; status: JobStatus; error: string | null; queued_behind: number;
  events: IngestEvent[]; result: IngestResult | null; seconds: number | null;
}
export interface RowFix { code?: string; name_th?: string; lecture?: number; lab?: number; credits?: number }
export interface Sample { id: string; label: string; note?: string }

export const cropUrl = (id: string, i: number) => `/api/jobs/${id}/rows/${i}/crop`;
export const exportUrl = (id: string, kind: 'json' | 'csv') => `/api/jobs/${id}/export.${kind}`;

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${path}`, init); }
  catch { throw new ApiException({ code: 'SOLVER_UNREACHABLE', message: 'ติดต่อ backend ไม่ได้ (เปิด docker compose ใน backend/ แล้วหรือยัง?)' }); }
  const body = ((await res.json().catch(() => ({}))) ?? {}) as { detail?: unknown };
  if (!res.ok) {
    const d = body.detail;
    const message = typeof d === 'string' ? d : Array.isArray(d) ? String((d[0] as { msg?: string })?.msg ?? res.statusText) : res.statusText;
    throw new ApiException({ code: `HTTP_${res.status}`, message });
  }
  return body as T;
}

export const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const listSamples = () => call<Sample[]>('/api/samples');
export function startRead(file: File): Promise<{ id: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return call('/api/read', { method: 'POST', body: fd });
}
export const startSample = (id: string) => call<{ id: string }>(`/api/read/sample/${id}`, { method: 'POST' });
export const getJob = (id: string, since = 0) => call<IngestJob>(`/api/jobs/${id}?since=${since}`);
export const cancelJob = (id: string) => call<{ status: JobStatus }>(`/api/jobs/${id}/cancel`, { method: 'POST' });
export const fixRow = (id: string, i: number, fix: RowFix) =>
  call<{ row: IngestRow; summary: IngestSummary }>(`/api/jobs/${id}/rows/${i}`, json('PUT', fix));
