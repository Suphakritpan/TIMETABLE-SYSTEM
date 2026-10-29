// วัน/คาบมาตรฐานที่หน้าจอใช้แสดงตาราง (ตารางจริงมาจาก backend: ดู api/schedule.ts)
import type { Period } from '../types';

export const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
const T = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
export const PERIODS: Period[] = T.map((time, i) => ({ no: i + 1, time }));
