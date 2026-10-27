import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'info' | 'error';
interface ToastItem { id: number; tone: ToastTone; text: string; undo?: () => void }
interface Api { show: (text: string, opts?: { tone?: ToastTone; undo?: () => void }) => void }

const Ctx = createContext<Api | null>(null);
const ICON: Record<ToastTone, string> = { success: '✓', info: 'ⓘ', error: '✕' };
let seq = 0;

// success/info หายเองใน 4 วินาที (undo 8 วินาที) · error ค้างจนกดปิด (design-system §4, §6.1)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback<Api['show']>((text, { tone = 'success', undo } = {}) => {
    const id = ++seq;
    setItems((xs) => [...xs, { id, tone, text, undo }]);
    if (tone !== 'error') setTimeout(() => dismiss(id), undo ? 8000 : 4000);
  }, [dismiss]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span aria-hidden="true">{ICON[t.tone]}</span>
            <span>{t.text}</span>
            {t.undo && <button type="button" className="btn btn-tertiary" onClick={() => { t.undo?.(); dismiss(t.id); }}>ย้อนกลับ</button>}
            <button type="button" className="btn btn-tertiary" aria-label="ปิดข้อความ" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast ต้องอยู่ใน ToastProvider');
  return v;
}
