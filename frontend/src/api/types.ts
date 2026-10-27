// รูปข้อมูลจาก API ตาม doc/dev/api.md (ข้อเสนอ: ปรับตาม /openapi.json เมื่ออานนท์ส่งมา) ห้ามใช้ใน UI ตรง ๆ ต้องผ่านตัวแปลง

export interface ApiError { code: string; message: string; details?: Record<string, unknown> }

export class ApiException extends Error {
  readonly code: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
  }
}

export interface ApiPlaced {
  class_id: string;
  plan_row_id: string;
  group_id: string;
  teacher_ids: string[];
  room_id: string;
  day: number;
  start_period: number;
  span: number;
  pinned: boolean;
}
export interface ApiUnplaced { class_id: string; plan_row_id: string; reason: string; fix: string }
export interface ApiCandidate {
  id: string;
  score: number;
  placed: ApiPlaced[];
  unplaced: ApiUnplaced[];
  /** ❓ ยังไม่อยู่ใน api.md §7.1 (ข้อเสนอ: class_id ที่ชนกัน) ต้องถามอานนท์ ข้อ 1.4 */
  conflicts?: string[];
}
export type ApiRunStatus = 'queued' | 'running' | 'ok' | 'partial' | 'failed' | 'cancelled';
export interface ApiRun {
  id: string;
  status: ApiRunStatus;
  progress: { stage: string; percent: number };
  candidates: ApiCandidate[];
  error: ApiError | null;
}

/** ตารางค้นชื่อจาก id (ใน API จริงจะมาจาก endpoint ของอาจารย์/ห้อง/แผนการเรียน) */
export interface Directory {
  teachers: Record<string, string>;
  rooms: Record<string, string>;
  planRows: Record<string, { code: string; name: string; span?: number }>;
}
