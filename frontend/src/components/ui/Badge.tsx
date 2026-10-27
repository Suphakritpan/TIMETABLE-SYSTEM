import type { ReactNode } from 'react';

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const ICON: Record<Tone, string> = { success: '✓', warning: '⚠', error: '✕', info: 'ⓘ', neutral: '' };

// สถานะ = สี + ไอคอน + ข้อความ เสมอ (ไม่พึ่งสีอย่างเดียว)
export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {ICON[tone] && <span aria-hidden="true">{ICON[tone]}</span>}
      {children}
    </span>
  );
}
