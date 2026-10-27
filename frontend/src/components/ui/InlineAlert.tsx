import type { ReactNode } from 'react';
import type { Tone } from './Badge';

const ICON: Record<Exclude<Tone, 'neutral'>, string> = { success: '✓', warning: '⚠', error: '✕', info: 'ⓘ' };

// แถบข้อความในหน้า (ไม่ใช่ Toast) error ใช้ role=alert ให้โปรแกรมอ่านหน้าจอประกาศทันที
export default function InlineAlert({ tone = 'info', children }: { tone?: Exclude<Tone, 'neutral'>; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{ICON[tone]}</span>
      <div>{children}</div>
    </div>
  );
}
