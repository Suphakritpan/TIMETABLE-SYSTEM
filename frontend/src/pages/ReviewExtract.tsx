import { useState } from 'react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import TimetableGrid, { STATUS } from '../components/timetable/TimetableGrid';
import { DAYS, ITEMS, PERIODS } from '../data/sample';
import type { ClassItem } from '../types';

const needsReview = (it: ClassItem) => it.status === 'review' || it.status === 'conflict';

export default function ReviewExtract() {
  const [items, setItems] = useState<ClassItem[]>(ITEMS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sel = items.find((i) => i.id === selectedId);
  const todo = items.filter(needsReview);

  const confirm = (id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'confirmed' } : x)));
  const next = () => {
    const n = todo.find((i) => i.id !== selectedId) ?? todo[0];
    if (n) setSelectedId(n.id);
  };

  return (
    <>
      <div className="toolbar">
        <h1>ตรวจทานตารางที่สกัดได้</h1>
        <span className="spacer" />
        <span>ต้องตรวจ <b>{todo.length}</b> / {items.length} ช่อง</span>
        <Button onClick={next} disabled={!todo.length}>ช่องถัดไปที่ต้องตรวจ</Button>
        <Button
          variant="primary"
          disabled={todo.length > 0}
          title={todo.length ? `ยังมี ${todo.length} ช่องที่ต้องตรวจ` : undefined}
        >
          ยืนยันและบันทึกเข้าฐานข้อมูล
        </Button>
      </div>

      <ul className="legend" aria-label="คำอธิบายสถานะ">
        {Object.entries(STATUS).filter(([k]) => k !== 'unplaced' && k !== 'pinned').map(([k, s]) => (
          <li key={k}><span className={`swatch tt-${k}`} aria-hidden="true">{s.mark}</span>{s.label}</li>
        ))}
      </ul>

      <div className="tt-wrap">
        <TimetableGrid days={DAYS} periods={PERIODS} items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {sel ? (
        <section className="panel" aria-label="แก้ช่อง">
          <h2>{DAYS[sel.day]} คาบ {sel.start}–{sel.start + sel.span - 1}</h2>
          <p><b>{sel.code}</b> {sel.name} · {sel.room} · {sel.teacher}</p>
          <p>
            <Badge tone={(sel.conf ?? 100) < 70 ? 'warning' : 'neutral'}>ความมั่นใจ {sel.conf}%</Badge>{' '}
            {sel.status === 'conflict' && <Badge tone="error">ชนกับช่องอื่น</Badge>}
            {sel.status === 'confirmed' && <Badge tone="success">ยืนยันแล้ว</Badge>}
          </p>
          <div className="actions">
            <Button variant="primary" onClick={() => confirm(sel.id)} disabled={sel.status === 'confirmed'}>ยืนยันช่องนี้</Button>
            <Button onClick={next} disabled={!todo.length}>ข้ามไปช่องถัดไป</Button>
          </div>
        </section>
      ) : (
        <p className="empty">เลือกช่องในตารางเพื่อตรวจและแก้ไข</p>
      )}
    </>
  );
}
