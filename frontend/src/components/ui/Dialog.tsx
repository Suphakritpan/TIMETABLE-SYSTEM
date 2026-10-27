import { useEffect, useId, useRef, type ReactNode } from 'react';
import Button from './Button';

interface Props { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Esc ปิด, โฟกัสติดอยู่ใน dialog, ปิดแล้วโฟกัสกลับปุ่มที่เปิด (design-system §4)
export default function Dialog({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 id={titleId}>{title}</h2>
        <div>{children}</div>
        <div className="actions">{footer ?? <Button onClick={onClose}>ปิด</Button>}</div>
      </div>
    </div>
  );
}
