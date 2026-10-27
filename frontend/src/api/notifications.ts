import { delay } from './util';
// การแจ้งเตือนในแอป (1.1): ศูนย์กลางของ mock — API อื่นเรียก notify() เมื่อมีเหตุการณ์ (เปิดรอบ ขอเปลี่ยน แก้โดยหัวหน้า เผยแพร่ ฯลฯ)
// ในแอปเสมอ + อีเมลเมื่อมี SMTP (D12) mock นี้ไม่มี SMTP จึงมีแต่ในแอป
export interface Notification { id: string; user_id: string; body: string; at: number; read: boolean; kind: string }

let now = () => Date.now();
export const setNotificationsClock = (fn: () => number) => { now = fn; };
let seq = 0;
let notes: Notification[] = [];
export function resetMockNotifications() { seq = 0; notes = []; now = () => Date.now(); }

export function notify(userId: string, body: string, kind = 'info') {
  notes.push({ id: `n${++seq}`, user_id: userId, body, at: now(), read: false, kind });
}


/** ใหม่สุดก่อน */
export async function listNotifications(userId: string): Promise<Notification[]> {
  await delay();
  return structuredClone(notes.filter((n) => n.user_id === userId)).sort((a, b) => b.at - a.at || Number(b.id.slice(1)) - Number(a.id.slice(1)));
}
export async function unreadCount(userId: string): Promise<number> { await delay(); return notes.filter((n) => n.user_id === userId && !n.read).length; }
export async function markRead(userId: string, id?: string): Promise<void> {
  await delay();
  notes.forEach((n) => { if (n.user_id === userId && (!id || n.id === id)) n.read = true; });
}
