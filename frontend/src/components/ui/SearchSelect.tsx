// ตัวเลือกแบบเปิดรายการ + ช่องค้นหา (combobox ตาม ARIA APG) ใช้เมื่อรายการยาวเกินกว่า <select> จะหาได้สะดวก
import { useEffect, useId, useRef, useState } from 'react';

interface Props { label: string; options: string[]; value: string; onChange: (v: string) => void; placeholder: string }

export default function SearchSelect({ label, options, value, onChange, placeholder }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const shown = options.filter((o) => o.includes(q.trim()));
  const items = ['', ...shown]; // '' = ล้างค่า (แถว "-- เลือก --")

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };
  const openList = () => { setQ(''); setActive(Math.max(0, options.indexOf(value) + 1)); setOpen(true); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active] ?? ''); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="field" ref={root}>
      <span id={`${id}-l`}>{label}</span>
      <div className="ss">
        <button type="button" className="input ss-btn" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-lb`} aria-labelledby={`${id}-l`} onClick={() => (open ? setOpen(false) : openList())}>
          <span className={value ? undefined : 'muted'}>{value || placeholder}</span>
        </button>
        {open && (
          <div className="ss-pop">
            <input className="input" autoFocus type="search" aria-label={`ค้นหา${label}`} aria-controls={`${id}-lb`} aria-activedescendant={`${id}-o${active}`} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
            <ul id={`${id}-lb`} role="listbox" aria-labelledby={`${id}-l`}>
              {items.map((o, i) => (
                <li key={o} id={`${id}-o${i}`} role="option" aria-selected={o === value} className={i === active ? 'active' : undefined} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>{o || placeholder}</li>
              ))}
              {shown.length === 0 && <li role="presentation" className="muted">ไม่พบรายการ</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
