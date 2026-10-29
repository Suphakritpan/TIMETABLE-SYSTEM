import type { SchedEvent } from '../../api/schedule';

export const STEPS: [string, string][] = [['build', 'สร้างคาบเรียน'], ['precheck', 'ตรวจก่อนจัด'], ['solve', 'แข่งกันจัด'], ['check', 'ตรวจซ้ำ'], ['score', 'ให้คะแนน']];
const STEP_NAME: Record<string, string> = Object.fromEntries(STEPS);

/** ข้อความบรรทัดเดียวของเหตุการณ์ในบันทึกการจัด */
export function eventText(e: SchedEvent): string {
  if (e.event === 'stage') {
    const extra = (e.tightness !== undefined ? ` · แน่น ${Math.round(e.tightness * 100)}%` : '') + (e.quality !== undefined ? ` · คุณภาพ ${e.quality}` : '');
    return `${STEP_NAME[e.name ?? ''] ?? e.name}: ${e.state === 'start' ? 'เริ่ม' : 'เสร็จ'}${extra}`;
  }
  if (e.event === 'candidate') {
    if (e.state === 'start') return `ลองจัดครั้งที่ ${e.seed}`;
    return `ครั้งที่ ${e.seed}: ${e.status} · วางได้ ${e.placed}/${e.of}${e.quality !== undefined ? ` · ${e.quality} คะแนน` : ''}`;
  }
  return e.event === 'end' ? `จบ: ${e.status}` : e.event;
}
