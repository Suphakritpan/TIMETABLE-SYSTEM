// 4.1 หน้าแรกอาจารย์: สิ่งที่ครบกำหนด (รอบเวลาว่าง) — รายการปัญหา/ตรวจทาน (4.3/4.4) รอ API ขั้นถัดไป
import { useEffect, useState } from 'react';
import { myRounds, type ResponseStatus, type Round } from '../api/availability';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';

const fmt = (ms: number) => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function TeacherHome({ onAvailability }: { onAvailability: () => void }) {
  const { user } = useSession();
  const [rows, setRows] = useState<{ round: Round; status: ResponseStatus; profileName: string }[] | null>(null);
  useEffect(() => { void myRounds(user?.id ?? '').then(setRows); }, [user?.id]);

  const todo = (rows ?? []).filter((r) => r.status === 'not_yet' || r.status === 'late');
  return (
    <>
      <div className="toolbar"><h1>หน้าแรกของฉัน</h1></div>
      <section className="panel" aria-label="สิ่งที่ครบกำหนด">
        <h2>สิ่งที่ครบกำหนด</h2>
        {rows === null ? <Skeleton lines={2} label="กำลังโหลด" /> : todo.length === 0 ? (
          <EmptyState>ไม่มีรายการที่ต้องทำ</EmptyState>
        ) : (
          <ul>
            {todo.map((r) => (
              <li key={r.round.id}>
                ส่งเวลาว่างสำหรับ “{r.profileName}” กำหนด {fmt(r.round.deadline)}{' '}
                {r.status === 'late' ? <Badge tone="error">ล่าช้า</Badge> : <Badge tone="warning">ยังไม่ส่ง</Badge>}{' '}
                <Button variant="primary" onClick={onAvailability}>กรอกเวลาว่าง</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
