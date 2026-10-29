// เมนูปรับแต่งหน้าตา: ธีม สีหลัก ขนาดตัวอักษร ความหนาแน่น มุม — เก็บใน localStorage แล้วตั้ง data-* บน <html>
import { useEffect, useState } from 'react';

const OPTS = {
  theme: { label: 'ธีม', def: 'light', v: [['light', 'สว่าง'], ['auto', 'ตามระบบ'], ['dark', 'มืด']] },
  accent: { label: 'สีหลัก', def: 'default', v: [['default', 'น้ำเงินเทา'], ['teal', 'เขียวน้ำทะเล'], ['indigo', 'คราม'], ['rose', 'กุหลาบ'], ['green', 'เขียว']] },
  size: { label: 'ขนาดตัวอักษร', def: 'm', v: [['m', 'ปกติ'], ['l', 'ใหญ่'], ['xl', 'ใหญ่มาก']] },
  density: { label: 'ความหนาแน่น', def: 'default', v: [['compact', 'แน่น'], ['default', 'ปกติ'], ['comfortable', 'โปร่ง']] },
  round: { label: 'มุม', def: 'default', v: [['none', 'เหลี่ยม'], ['default', 'ปกติ'], ['round', 'มน']] },
} as const;
type Key = keyof typeof OPTS;
type Prefs = Record<Key, string>;
const STORE = 'appearance';
const DEFAULTS = Object.fromEntries(Object.entries(OPTS).map(([k, o]) => [k, o.def])) as Prefs;

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? '{}') }; } catch { return DEFAULTS; }
}

function apply(p: Prefs) {
  const el = document.documentElement;
  (Object.keys(OPTS) as Key[]).forEach((k) => {
    if (p[k] === OPTS[k].def) el.removeAttribute(`data-${k}`); else el.setAttribute(`data-${k}`, p[k]);
  });
}

export function applyStoredAppearance() { apply(load()); }

export default function AppearanceMenu() {
  const [p, setP] = useState(load);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    apply(p);
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* ใช้ได้แต่ไม่จำค่า */ }
  }, [p]);

  return (
    <details className="appearance" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="btn btn-tertiary">ปรับแต่งหน้าตา</summary>
      {open && <div className="appearance-panel" role="group" aria-label="ปรับแต่งหน้าตา">
        {(Object.keys(OPTS) as Key[]).map((k) => (
          <label key={k}>
            <span>{OPTS[k].label}</span>
            <select className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })}>
              {OPTS[k].v.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <button type="button" className="btn btn-tertiary" onClick={() => setP(DEFAULTS)}>คืนค่าเริ่มต้น</button>
      </div>}
    </details>
  );
}
