import type { ReactNode } from 'react';

// หัวหน้า: ชื่อ (h1 เดียวต่อหน้า) + คำอธิบายสั้น + คำสั่งชิดขวา
export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
