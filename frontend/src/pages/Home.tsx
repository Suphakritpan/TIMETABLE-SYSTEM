// 2.1 หน้าแรก HEAD/ASSISTANT: ปุ่มใหญ่ "เริ่มตารางเรียนภาคนี้" (หรือ "ทำต่อ …") + สิ่งที่ต้องทำ
// สิ่งที่ต้องทำที่นี่คำนวณจากข้อมูลโปรไฟล์เท่านั้น (อาจารย์ล่าช้า/blocker/คำขอใหม่ต้องรอ API ขั้น 3–4, 8)
import { useEffect, useState } from 'react';
import { listProfiles } from '../api/profiles';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { frontier } from '../profile/steps';
import type { Profile } from '../types';

export default function Home({ departmentId, onOpen, onProfiles }: { departmentId: string; onOpen: (id: string) => void; onProfiles: () => void }) {
  const [rows, setRows] = useState<Profile[] | null>(null);
  useEffect(() => { void listProfiles(departmentId).then(setRows); }, [departmentId]);

  if (rows === null) return <><div className="toolbar"><h1>หน้าแรก</h1></div><Skeleton lines={4} label="กำลังโหลด" /></>;

  const working = rows.find((p) => p.status !== 'published');
  const stale = rows.flatMap((p) => p.year_plans.filter((y) => y.steps.includes('stale')).map((y) => ({ p, y })));
  const notStarted = working?.year_plans.filter((y) => frontier(y.steps) === 0) ?? [];

  return (
    <>
      <div className="toolbar"><h1>หน้าแรก</h1></div>
      <div className="hero">
        {working
          ? <Button variant="primary" className="btn-lg" onClick={() => onOpen(working.id)}>ทำต่อ “{working.name}”</Button>
          : <Button variant="primary" className="btn-lg" onClick={onProfiles}>เริ่มตารางเรียนภาคนี้</Button>}
      </div>

      <section className="panel" aria-label="สิ่งที่ต้องทำตอนนี้">
        <h2>สิ่งที่ต้องทำตอนนี้</h2>
        {stale.length === 0 && notStarted.length === 0 ? (
          <EmptyState>ไม่มีรายการค้าง</EmptyState>
        ) : (
          <ul>
            {stale.map(({ p, y }) => (
              <li key={y.id}>
                <span aria-hidden="true">⚠ </span>
                {y.program} ปี {y.year} ของ “{p.name}” มี {y.steps.filter((s) => s === 'stale').length} ขั้นล้าสมัย{' '}
                <Button variant="tertiary" onClick={() => onOpen(p.id)}>เปิด</Button>
              </li>
            ))}
            {notStarted.map((y) => (
              <li key={y.id}>{y.program} ปี {y.year} ยังไม่เริ่ม</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
