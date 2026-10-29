// ตารางวัน × คาบ แบบ "เพนต์สี": เลือกพู่กัน (สอนได้ / พัก / ไม่สอน) แล้วคลิกหรือลากทับช่อง คลิกหัวแถว/หัวคอลัมน์เพื่อทาทั้งวัน/ทั้งคาบ
// สถานะแต่ละช่องมีทั้งสีและข้อความ (ไม่ใช้สีอย่างเดียว) ช่องเป็นปุ่ม ใช้คีย์บอร์ดได้ (Tab + Space/Enter ทาด้วยพู่กันที่เลือก)
import { useEffect, useRef, useState } from 'react';
import { cellKey, type Cell } from '../../api/setup';

const BRUSH: { id: Cell; label: string; mark: string }[] = [
  { id: 'teach', label: 'สอนได้', mark: 'สอน' },
  { id: 'break', label: 'พัก', mark: 'พัก' },
  { id: 'off', label: 'ไม่สอน', mark: '—' },
];

interface Props { days: string[]; periods: { no: number; from: string; to: string }[]; value: Record<string, Cell>; onChange: (v: Record<string, Cell>) => void; disabled?: boolean }

export default function PaintGrid({ days, periods, value, onChange, disabled }: Props) {
  const [brush, setBrush] = useState<Cell>('teach');
  const painting = useRef(false);
  const draft = useRef(value);
  useEffect(() => { draft.current = value; }, [value]);
  useEffect(() => {
    const stop = () => { painting.current = false; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const paint = (keys: string[]) => {
    const next = { ...draft.current };
    for (const k of keys) { if (brush === 'off') delete next[k]; else next[k] = brush; }
    draft.current = next;
    onChange(next);
  };
  const stateOf = (d: number, p: number): Cell => value[cellKey(d, p)] ?? 'off';

  return (
    <div>
      <div role="radiogroup" aria-label="พู่กัน" className="pg-brushes">
        {BRUSH.map((b) => (
          <label key={b.id} className={`pg-brush pg-${b.id}${brush === b.id ? ' on' : ''}`}>
            <input type="radio" name="brush" className="sr-only" checked={brush === b.id} disabled={disabled} onChange={() => setBrush(b.id)} />
            <span aria-hidden="true" className="pg-swatch" /> {b.label}
          </label>
        ))}
        <span className="muted">คลิกหรือลากทับช่องเพื่อทาสี · คลิกชื่อวัน/เลขคาบเพื่อทาทั้งแถว</span>
      </div>
      <div className="dt-wrap">
        <table className="avail pg">
          <caption className="sr-only">กำหนดคาบที่สอนได้และคาบพัก</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">วัน</span></th>
              {periods.map((p) => (
                <th key={p.no} scope="col">
                  <button type="button" className="pg-head" disabled={disabled} onClick={() => paint(days.map((_, d) => cellKey(d, p.no)))} aria-label={`ทาทั้งคาบที่ ${p.no}`}>{p.no}</button>
                  <small>{p.from}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, di) => (
              <tr key={d}>
                <th scope="row">
                  <button type="button" className="pg-head" disabled={disabled} onClick={() => paint(periods.map((p) => cellKey(di, p.no)))} aria-label={`ทาทั้งวัน${d}`}>{d}</button>
                </th>
                {periods.map((p) => {
                  const st = stateOf(di, p.no);
                  const b = BRUSH.find((x) => x.id === st)!;
                  return (
                    <td key={p.no}>
                      <button
                        type="button"
                        className={`avail-cell pg-cell pg-${st}`}
                        aria-label={`${d} คาบ ${p.no} ${b.label}`}
                        disabled={disabled}
                        onPointerDown={(e) => { e.preventDefault(); painting.current = true; paint([cellKey(di, p.no)]); }}
                        onPointerEnter={() => { if (painting.current) paint([cellKey(di, p.no)]); }}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); paint([cellKey(di, p.no)]); } }}
                      >
                        <span aria-hidden="true">{b.mark}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
