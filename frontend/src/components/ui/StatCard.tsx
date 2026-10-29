import type { Tone } from './Badge';

// ตัวเลขสรุป: ป้าย + ค่า + หมายเหตุ; tone ใช้ขอบซ้ายสี (ข้อความยังบอกความหมายเอง ไม่พึ่งสีอย่างเดียว)
export default function StatCard({ label, value, hint, tone = 'neutral' }: { label: string; value: string | number; hint?: string; tone?: Tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted">{hint}</div>}
    </div>
  );
}
