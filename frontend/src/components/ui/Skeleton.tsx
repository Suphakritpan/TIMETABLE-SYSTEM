// แท่งรอโหลดเงียบ ๆ (ไม่ขยับเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว ดู .skeleton ใน app.css) ใช้คู่กับ aria-busy ที่กล่องที่ห่อ
// variant="table" วาดเป็นหัวตาราง + แถว เพื่อให้พื้นที่ตอนโหลดใกล้เคียงของจริง (ลด layout shift)
const WIDTHS = ['72%', '48%', '86%', '60%', '78%'];

export default function Skeleton({ lines = 3, label = 'กำลังโหลด', variant = 'text' }: { lines?: number; label?: string; variant?: 'text' | 'table' }) {
  return (
    <div role="status" aria-busy="true" className={variant === 'table' ? 'skeleton-table' : undefined}>
      <span className="sr-only">{label}</span>
      {variant === 'table' ? (
        <>
          <div className="skeleton-row head" aria-hidden="true">{[0, 1, 2, 3].map((c) => <span key={c} className="skeleton" />)}</div>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="skeleton-row" aria-hidden="true">{[0, 1, 2, 3].map((c) => <span key={c} className="skeleton" style={{ width: WIDTHS[(i + c) % WIDTHS.length] }} />)}</div>
          ))}
        </>
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <div key={i} className="skeleton" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
        ))
      )}
    </div>
  );
}
