// เมนูปรับแต่งหน้าตา: ธีม สีหลัก ขนาดตัวอักษร ความหนาแน่น มุม — เก็บใน localStorage แล้วตั้ง data-* บน <html>
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';

const OPTS = {
  theme: { label: 'ธีม', def: 'light', v: [['light', 'สว่าง'], ['auto', 'ตามระบบ'], ['dark', 'มืด']] },
  accent: { label: 'สีหลัก', def: 'default', v: [['default', 'น้ำเงินเทา'], ['teal', 'เขียวน้ำทะเล'], ['indigo', 'คราม'], ['rose', 'กุหลาบ'], ['green', 'เขียว']] },
  size: { label: 'ขนาดตัวอักษร', def: 'm', v: [['m', 'ปกติ'], ['l', 'ใหญ่'], ['xl', 'ใหญ่มาก']] },
  density: { label: 'ความหนาแน่น', def: 'default', v: [['compact', 'แน่น'], ['default', 'ปกติ'], ['comfortable', 'โปร่ง']] },
  round: { label: 'มุม', def: 'default', v: [['none', 'เหลี่ยม'], ['default', 'ปกติ'], ['round', 'มน']] },
} as const;
const SWATCH: Record<string, string> = { default: '#1f5fae', teal: '#0f6b6b', indigo: '#4338ca', rose: '#be123c', green: '#237a3b' }; // สีของโหมดสว่าง ใช้เป็นตัวอย่างเท่านั้น
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
  const ref = useRef<HTMLDetailsElement>(null);
  // ปิดเมื่อกด Esc (คืนโฟกัสให้ปุ่ม) หรือคลิกนอกเมนู
  useEffect(() => {
    if (!open) return;
    const close = () => { if (ref.current) ref.current.open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); ref.current?.querySelector('summary')?.focus(); } };
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);
  useEffect(() => {
    apply(p);
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* ใช้ได้แต่ไม่จำค่า */ }
  }, [p]);

  return (
    <details ref={ref} className="appearance" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="appearance-btn" aria-label="ตั้งค่าหน้าตา" title="ตั้งค่าหน้าตา"><Icon name="settings" size={22} /></summary>
      {open && <div className="appearance-panel" role="group" aria-label="ตั้งค่าหน้าตา">
        <strong className="appearance-title">ตั้งค่าหน้าตา</strong>
        {(Object.keys(OPTS) as Key[]).map((k) => (
          <div key={k} className="appearance-row">
            <span id={`ap-${k}`}>{OPTS[k].label}</span>
            <div className={k === 'accent' ? 'swatches' : 'segmented'} role="radiogroup" aria-labelledby={`ap-${k}`}>
              {OPTS[k].v.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={p[k] === v} aria-label={k === 'accent' ? l : undefined} title={l}
                  className={k === 'accent' ? 'swatch' : 'seg'} style={k === 'accent' ? { background: SWATCH[v] } : undefined}
                  onClick={() => setP({ ...p, [k]: v })}>
                  {k === 'accent' ? (p[k] === v ? '✓' : null) : l}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-tertiary" onClick={() => setP(DEFAULTS)}>คืนค่าเริ่มต้น</button>
      </div>}
    </details>
  );
}
