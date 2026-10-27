// ตารางเลือกคาบที่ไม่ว่าง (วัน × คาบ) แต่ละช่องเป็นปุ่มสลับ: สถานะ = ไอคอน ✕ + ข้อความ (ไม่ใช้สีอย่างเดียว) ใช้คีย์บอร์ดได้เอง (Tab/Space)
import { slot } from '../../api/availability';
import type { Period } from '../../types';

interface Props { days: string[]; periods: Period[]; busy: string[]; onChange: (busy: string[]) => void; disabled?: boolean }

export default function AvailabilityGrid({ days, periods, busy, onChange, disabled }: Props) {
  const set = new Set(busy);
  const toggle = (k: string) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange([...next].sort());
  };
  return (
    <div className="dt-wrap">
      <table className="avail">
        <caption className="sr-only">เลือกคาบที่ไม่ว่าง</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">วัน</span></th>
            {periods.map((p) => <th key={p.no} scope="col">{p.no}<small>{p.time}</small></th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((d, di) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              {periods.map((p) => {
                const k = slot(di, p.no);
                const on = set.has(k);
                return (
                  <td key={p.no}>
                    <button
                      type="button"
                      className={`avail-cell${on ? ' avail-busy' : ''}`}
                      aria-pressed={on}
                      aria-label={`${d} คาบ ${p.no} ${on ? 'ไม่ว่าง' : 'ว่าง'}`}
                      disabled={disabled}
                      onClick={() => toggle(k)}
                    >
                      <span aria-hidden="true">{on ? '✕' : ''}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
