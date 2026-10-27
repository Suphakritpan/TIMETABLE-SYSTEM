import { useState } from 'react';
import { generate, type UiRun } from '../api/runs';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import InlineAlert from '../components/ui/InlineAlert';
import TimetableGrid from '../components/timetable/TimetableGrid';
import { DAYS, PERIODS } from '../data/sample';

type RunState =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'failed'; error: string }
  | ({ state: 'done' } & UiRun);

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

interface Props {
  setStatus: (s: string) => void;
  /** ตัวสร้างผลลัพธ์ (ค่าเริ่มต้น = solver จำลอง) ขั้น 6 ส่งตัวที่ตรวจว่ารับทราบ pre-check แล้ว */
  generate?: () => Promise<UiRun>;
  /** ผลรันล่าสุดที่เก็บไว้ (รีเฟรชแล้วไม่หาย) */
  initial?: UiRun | null;
  onRun?: (r: UiRun) => void;
  /** ฝังในพื้นที่ทำงานของโปรไฟล์: ไม่ใช้ h1 ซ้ำ */
  embedded?: boolean;
}

export default function Timetable({ setStatus, generate: gen = generate, initial = null, onRun, embedded = false }: Props) {
  const [run, setRun] = useState<RunState>(initial ? { state: 'done', ...initial } : { state: 'idle' });
  const [last, setLast] = useState<UiRun | null>(initial); // ผลดีล่าสุด เก็บไว้เมื่อรันใหม่ล้มเหลว (api.md §7.1)
  const [by, setBy] = useState<'all' | 'teacher' | 'room'>('all');
  const [val, setVal] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const go = async () => {
    setRun({ state: 'running' });
    setStatus('กำลังจัดตาราง…');
    try {
      const r = await gen();
      onRun?.(r);
      setRun({ state: 'done', ...r });
      setLast(r);
      setStatus(`จัดแล้ว ${r.placed.length} คาบ · ยังไม่ลง ${r.unplaced.length} · คะแนน ${r.score}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
      setRun({ state: 'failed', error });
      setStatus(error);
    }
  };

  const shownRun = run.state === 'done' ? run : last;
  const placed = shownRun?.placed ?? [];
  const options = by === 'all' ? [] : uniq(placed.flatMap((i) => (by === 'room' ? [i.room] : i.teacher.split(' + '))));
  const shown = by === 'all' || !val ? placed : placed.filter((i) => (by === 'room' ? i.room === val : i.teacher.includes(val)));
  const sel = placed.find((i) => i.id === selectedId);
  const clash = placed.filter((i) => i.status === 'conflict');
  const running = run.state === 'running';

  return (
    <>
      <div className="toolbar">
        {embedded ? <h3>ผลการจัดตาราง</h3> : <h1>สร้างตาราง</h1>}
        <span className="spacer" />
        <select className="input" value={by} onChange={(e) => { setBy(e.target.value as typeof by); setVal(''); }} aria-label="มุมมอง">
          <option value="all">ทุกคาบ</option>
          <option value="teacher">ตามอาจารย์</option>
          <option value="room">ตามห้อง</option>
        </select>
        {by !== 'all' && (
          <select className="input" value={val} onChange={(e) => setVal(e.target.value)} aria-label="เลือก">
            <option value="">ทั้งหมด</option>
            {options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
        <Button variant="primary" onClick={go} disabled={running} title={running ? 'กำลังรัน' : undefined}>
          {running ? 'กำลังจัดตาราง…' : 'Generate'}
        </Button>
      </div>

      {run.state === 'idle' && !last && <EmptyState>กด Generate เพื่อจัดตาราง (ตอนนี้ใช้ solver จำลอง)</EmptyState>}
      {run.state === 'failed' && <InlineAlert tone="error">{run.error}{last && ' · แสดงผลดีล่าสุดที่ยังอยู่'}</InlineAlert>}
      {shownRun && (
        <p>
          {shownRun.status === 'partial'
            ? <Badge tone="warning">ได้ผลบางส่วน</Badge>
            : <Badge tone="success">ครบทุกคาบ</Badge>}{' '}
          คะแนนคุณภาพ <b>{shownRun.score}</b>
          {clash.length > 0 && <> · <Badge tone="error">ชน {clash.length} คาบ</Badge></>}
        </p>
      )}

      {placed.length > 0 && (
        <div className="tt-wrap">
          <TimetableGrid days={DAYS} periods={PERIODS} items={shown} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      )}
      {sel && <p><b>{sel.code}</b> {sel.name} · {sel.room} · {sel.teacher}{sel.status === 'conflict' && ' — ชนกับคาบอื่น'}</p>}

      {shownRun && shownRun.unplaced.length > 0 && (
        <section className="panel" aria-label="คาบที่ยังไม่ลง">
          <h2>ยังไม่ลง ({shownRun.unplaced.length})</h2>
          <ul>
            {shownRun.unplaced.map((u) => (
              <li key={u.id}>
                <b>{u.code}</b> {u.name} <Badge tone="warning">ยังไม่ลง</Badge><br />
                <small>เหตุผล: {u.reason}<br />วิธีแก้ใกล้สุด: {u.fix}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
