// ตารางวัน x คาบ. หัวแถว/หัวคอลัมน์ตรึง. สถานะเซลล์ = สี + สัญลักษณ์ + ข้อความ (STATUS)
// โครง ARIA: grid > row > (columnheader | rowheader | gridcell). แถวใช้ display:contents เพื่อให้ CSS grid วางเซลล์ซ้อนกันได้
import { useRef, type KeyboardEvent } from 'react';
import type { CellStatus, ClassItem, Period } from '../../types';

export const STATUS: Record<CellStatus, { mark: string; label: string }> = {
  ok: { mark: '', label: 'ปกติ' },
  review: { mark: '⚠', label: 'ต้องตรวจ' },
  conflict: { mark: '✕', label: 'ชน' },
  confirmed: { mark: '✓', label: 'ยืนยันแล้ว' },
  edited: { mark: '✎', label: 'แก้ด้วยมือ' },
  unplaced: { mark: '…', label: 'ยังไม่ลง' },
  pinned: { mark: '📌', label: 'ปักหมุด' },
};

interface Props {
  days: string[];
  periods: Period[];
  items: ClassItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** ช่องข้างเคียงสำหรับปุ่มลูกศร: ซ้าย/ขวา = ช่องก่อน/ถัดไปในวันเดียวกัน, ขึ้น/ลง = ช่องที่เริ่มใกล้คาบเดิมสุดในวันก่อน/ถัดไปที่มีช่อง */
export function neighbor(items: ClassItem[], from: ClassItem, key: string): ClassItem | null {
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const same = items.filter((i) => i.day === from.day).sort((a, b) => a.start - b.start);
    const idx = same.findIndex((i) => i.id === from.id);
    return same[idx + (key === 'ArrowRight' ? 1 : -1)] ?? null;
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
  const step = key === 'ArrowDown' ? 1 : -1;
  const days = [...new Set(items.map((i) => i.day))].sort((a, b) => a - b);
  const next = days.filter((d) => (step === 1 ? d > from.day : d < from.day));
  const target = step === 1 ? next[0] : next[next.length - 1];
  if (target === undefined) return null;
  return items.filter((i) => i.day === target).sort((a, b) => Math.abs(a.start - from.start) - Math.abs(b.start - from.start))[0] ?? null;
}

export default function TimetableGrid({ days, periods, items, selectedId, onSelect }: Props) {
  const root = useRef<HTMLDivElement>(null);
  // roving tabindex: ช่องที่เลือก (หรือช่องแรก) เป็นจุด Tab เดียวของตาราง
  const tabId = items.find((i) => i.id === selectedId)?.id ?? items[0]?.id;

  const onKeyDown = (e: KeyboardEvent, it: ClassItem) => {
    const n = neighbor(items, it, e.key);
    if (!n) return;
    e.preventDefault();
    root.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(n.id)}"]`)?.focus();
  };

  return (
    <div
      ref={root}
      className="tt"
      role="grid"
      aria-label="ตารางเรียน"
      style={{ gridTemplateColumns: `72px repeat(${periods.length}, minmax(104px, 1fr))` }}
    >
      <div className="tt-row" role="row">
        <div className="tt-corner" role="columnheader"><span className="sr-only">วัน / คาบ</span></div>
        {periods.map((p, i) => (
          <div key={p.no} className="tt-colhead" role="columnheader" style={{ gridColumn: i + 2 }}>
            {p.time}
            <small>คาบ {p.no}</small>
          </div>
        ))}
      </div>
      {days.map((d, r) => (
        <div key={d} className="tt-row" role="row">
          <div className="tt-rowhead" role="rowheader" style={{ gridRow: r + 2 }}>{d}</div>
          {periods.map((p, c) => (
            <div key={p.no} className="tt-empty" role="gridcell" aria-label={`${d} คาบ ${p.no} ว่าง`} style={{ gridRow: r + 2, gridColumn: c + 2 }} />
          ))}
          {items.filter((it) => it.day === r).map((it) => {
            const s = STATUS[it.status];
            return (
              <button
                key={it.id}
                data-id={it.id}
                type="button"
                role="gridcell"
                tabIndex={it.id === tabId ? 0 : -1}
                className={`tt-cell tt-${it.status}`}
                aria-selected={it.id === selectedId}
                aria-label={`${days[it.day]} คาบ ${it.start}–${it.start + it.span - 1} ${it.code} ${it.name} ${s.label}`}
                style={{ gridRow: it.day + 2, gridColumn: `${it.start + 1} / span ${it.span}` }}
                onClick={() => onSelect(it.id)}
                onKeyDown={(e) => onKeyDown(e, it)}
              >
                <b>{it.code}</b>
                <span className="tt-name">{it.name}</span>
                <span className="tt-meta">{it.room} · {it.teacher}</span>
                {s.mark && <span className="tt-mark" aria-hidden="true">{s.mark}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
