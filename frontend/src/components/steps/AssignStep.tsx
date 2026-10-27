// ขั้น 7: ห้อง + อาจารย์ต่อคาบ + พรีวิวกระดาษ A4 (flows F8) ตรวจการชนสดเมื่อเปลี่ยนห้อง
import { useMemo, useState } from 'react';
import { loadLastRun, saveLastRun } from '../../api/runs';
import { DAYS, PERIODS } from '../../data/sample';
import { findClashes } from '../../profile/clashes';
import type { ClassItem } from '../../types';
import TimetableGrid from '../timetable/TimetableGrid';
import Button from '../ui/Button';
import DataTable, { type Column } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import type { StepProps } from './types';

// ห้องที่เลือกได้ (ห้องของแผนก + ห้องร่วม) mock จนกว่าจะมี GET /departments/{dep}/rooms/available
export const ROOM_OPTIONS = ['COM602', 'COM603', 'COM404', '621', '11502', '11602', 'สนาม'];

export default function AssignStep({ profile, done, locked, onComplete }: StepProps) {
  const [run, setRun] = useState(() => loadLastRun(profile.id));
  const clashes = useMemo(() => findClashes(run?.placed ?? []), [run]);

  if (!run) return <EmptyState>ยังไม่มีตารางจากขั้น 6 กลับไปสร้างตารางก่อน</EmptyState>;

  const setRoom = (id: string, room: string) => {
    const next = { ...run, placed: run.placed.map((p) => (p.id === id ? { ...p, room } : p)) };
    setRun(next);
    saveLastRun(profile.id, next);
  };
  const missing = run.placed.filter((p) => !p.room || !p.teacher).length;
  const block = missing ? `ยังมี ${missing} คาบที่ไม่มีห้องหรืออาจารย์` : clashes.size ? `ยังมี ${clashes.size} คาบที่ชน` : null;

  const columns: Column<ClassItem>[] = [
    { key: 'when', header: 'เวลา', sortValue: (r) => r.day * 100 + r.start, render: (r) => `${DAYS[r.day]} คาบ ${r.start}–${r.start + r.span - 1}` },
    { key: 'subject', header: 'วิชา', sortValue: (r) => r.code, render: (r) => `${r.code} ${r.name}` },
    { key: 'teacher', header: 'อาจารย์', sortValue: (r) => r.teacher, render: (r) => r.teacher },
    {
      key: 'room', header: 'ห้อง', sortValue: (r) => r.room,
      render: (r) => (
        <select className="input" aria-label={`ห้องของ ${r.code}`} value={r.room} disabled={done || locked} onChange={(e) => setRoom(r.id, e.target.value)}>
          {!ROOM_OPTIONS.includes(r.room) && <option value={r.room}>{r.room || 'เลือกห้อง'}</option>}
          {ROOM_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
      ),
    },
    { key: 'clash', header: 'การชน', render: (r) => clashes.get(r.id)?.join(' · ') ?? <span className="muted">—</span> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={run.placed}
        rowKey={(r) => r.id}
        caption="ห้องและอาจารย์ต่อคาบ"
        rowProblem={(r) => clashes.get(r.id)?.[0] ?? null}
      />
      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" onClick={() => void onComplete()} disabled={block !== null} title={block ?? undefined}>ยืนยันห้องและอาจารย์</Button>
          {block && <span className="muted">{block}</span>}
        </div>
      )}
      <h3>พรีวิวกระดาษ A4</h3>
      <section className="a4" aria-label="พรีวิวกระดาษ A4">
        <TimetableGrid days={DAYS} periods={PERIODS} items={run.placed} selectedId={null} onSelect={() => {}} />
      </section>
    </>
  );
}
