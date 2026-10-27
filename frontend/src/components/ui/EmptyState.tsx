import type { ReactNode } from 'react';

// อธิบายว่าทำไมยังไม่มีข้อมูล 1 ประโยค + คำสั่งถัดไป 1 อย่าง (design-system §4)
export default function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{children}</p>
    </div>
  );
}
