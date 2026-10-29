// รูปข้อมูลจาก API ตาม doc/dev/api.md (ข้อเสนอ: ปรับตาม /openapi.json เมื่ออานนท์ส่งมา) ห้ามใช้ใน UI ตรง ๆ ต้องผ่านตัวแปลง

export interface ApiError { code: string; message: string; details?: Record<string, unknown> }

export class ApiException extends Error {
  readonly code: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
  }
}
