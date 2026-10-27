// แท่งรอโหลดเงียบ ๆ (ไม่ขยับเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว ดู .skeleton ใน app.css) ใช้คู่กับ aria-busy ที่กล่องที่ห่อ
export default function Skeleton({ lines = 3, label = 'กำลังโหลด' }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}
