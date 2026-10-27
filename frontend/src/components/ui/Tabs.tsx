import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef { key: string; label: string; badge?: ReactNode }
interface Props { tabs: TabDef[]; value: string; onChange: (key: string) => void; label: string; children?: ReactNode }

// ลูกศรซ้าย/ขวา + Home/End เลื่อนแท็บ (roving tabindex); เนื้อหาแท็บให้หน้าเป็นคนวาด ส่งเป็น children
export default function Tabs({ tabs, value, onChange, label, children }: Props) {
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value);
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].key);
    refs.current[tabs[to].key]?.focus();
  };

  return (
    <div>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`${id}-t-${t.key}`}
            aria-selected={t.key === value}
            aria-controls={`${id}-p`}
            tabIndex={t.key === value ? 0 : -1}
            className="tab"
            onClick={() => onChange(t.key)}
          >
            {t.label}{t.badge}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t-${value}`} tabIndex={0}>{children}</div>
    </div>
  );
}
