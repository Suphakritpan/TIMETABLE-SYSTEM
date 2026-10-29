// วงหมุนโหลด: ข้อความสำหรับโปรแกรมอ่านจอ + หยุดหมุนเมื่อผู้ใช้ตั้ง reduced-motion (ดู app.css)
export default function Spinner({ label = 'กำลังโหลด' }: { label?: string }) {
  return <span className="spinner" role="status"><span className="sr-only">{label}</span></span>;
}
