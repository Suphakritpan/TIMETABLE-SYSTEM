// รายละเอียดสดของการอ่านไฟล์: แผนที่หน้า (ข้อความ/OCR/ฟอนต์เพี้ยน) และผลแข่งเลือกรูปแบบ
import type { IngestEvent } from '../../api/ingest';

const HOW: Record<string, string> = { text: 'ข้อความ', ocr: 'OCR', 'garbled-ocr': 'ฟอนต์เพี้ยน → OCR', cells: 'อ่านช่องตารางซ้ำ' };

export function PageMap({ events }: { events: IngestEvent[] }) {
  const info = events.find((e) => e.event === 'pages') as (IngestEvent & { total: number; ocr: number[]; garbled: number[] }) | undefined;
  if (!info) return null;
  const how: Record<number, string> = {};
  const ring = new Set<number>();
  for (const e of events) {
    if (e.event !== 'page') continue;
    const n = Number(e.n);
    if (e.how === 'cells') ring.add(n); else how[n] = `หน้า ${n}: ${HOW[String(e.how)] ?? e.how} · ${e.words} คำ`;
  }
  return (
    <>
      <p className="muted">{info.total} หน้า · ต้อง OCR {info.ocr.length}{info.garbled.length > 0 && ` (ฟอนต์เพี้ยน ${info.garbled.length})`}</p>
      <ul className="pages" aria-label="แผนที่หน้า">
        {Array.from({ length: info.total }, (_, i) => i + 1).map((n) => (
          <li key={n} className={`pg ${how[n] ? String(events.find((e) => e.event === 'page' && e.n === n && e.how !== 'cells')?.how) : 'wait'}${ring.has(n) ? ' ring' : ''}`} title={how[n] ?? `หน้า ${n}: รอ`}>{n}</li>
        ))}
      </ul>
      <p className="muted small">สีเขียว = ข้อความ · น้ำเงิน = OCR · ม่วง = ฟอนต์เพี้ยน · ขอบเหลือง = อ่านช่องตารางซ้ำ</p>
    </>
  );
}

export function FormatRace({ events, winner }: { events: IngestEvent[]; winner?: string }) {
  const race = new Map<string, { label: string; value: number; list: boolean }>();
  for (const e of events) {
    if (e.event !== 'format') continue;
    const list = e.mode === 'list';
    race.set(String(e.name), { label: String(e.label), value: list ? Number(e.subjects) : Math.max(0, Number(e.score)), list });
  }
  if (race.size === 0) return null;
  const rows = [...race.entries()].sort((a, b) => b[1].value - a[1].value);
  const max = Math.max(1, ...rows.map(([, v]) => v.value));
  return (
    <ul className="plain" aria-label="ผลแข่งเลือกรูปแบบ">
      {rows.map(([k, v]) => (
        <li key={k} className={k === winner ? 'race-win' : ''}>
          <span title={v.label}>{v.label}{k === winner ? ' 🏆' : ''}</span>{' '}
          <progress max={max} value={v.value} aria-label={v.label} /> {v.value}{v.list ? ' วิชา' : ''}
        </li>
      ))}
    </ul>
  );
}
