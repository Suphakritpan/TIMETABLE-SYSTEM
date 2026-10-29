// 2.1 หน้าแรก HEAD/ASSISTANT: ปุ่มใหญ่ "เริ่มตารางเรียนภาคนี้" (หรือ "ทำต่อ …") + สิ่งที่ต้องทำ
// สิ่งที่ต้องทำที่นี่คำนวณจากข้อมูลโปรไฟล์เท่านั้น (อาจารย์ล่าช้า/blocker/คำขอใหม่ต้องรอ API ขั้น 3–4, 8)
import { useEffect, useState } from 'react';
import { listProfiles } from '../api/profiles';
import Button from '../components/ui/Button';
import Icon, { type IconName } from '../components/ui/Icon';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { hrefFor } from '../router/useRoute';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { frontier } from '../profile/steps';
import type { Profile } from '../types';

export default function Home({ departmentId, onOpen, onProfiles }: { departmentId: string; onOpen: (id: string) => void; onProfiles: () => void }) {
  const [rows, setRows] = useState<Profile[] | null>(null);
  useEffect(() => { void listProfiles(departmentId).then(setRows); }, [departmentId]);

  if (rows === null) return <><PageHeader title="หน้าแรก" subtitle="งานตารางเรียนของแผนกคุณ" /><Skeleton lines={4} label="กำลังโหลด" /></>;

  const working = rows.find((p) => p.status !== 'published');
  const stale = rows.flatMap((p) => p.year_plans.filter((y) => y.steps.includes('stale')).map((y) => ({ p, y })));
  const notStarted = working?.year_plans.filter((y) => frontier(y.steps) === 0) ?? [];

  const shortcuts: { key: 'profiles' | 'people' | 'ingest' | 'schedule'; label: string; desc: string; icon: IconName }[] = [
    { key: 'profiles', label: 'โปรไฟล์ตารางเรียน', desc: 'จัดการตารางแต่ละภาคเรียน', icon: 'calendar' },
    { key: 'people', label: 'บุคลากรและห้อง', desc: 'อาจารย์ ผู้ช่วย และห้องเรียน', icon: 'people' },
    { key: 'ingest', label: 'อ่านหลักสูตรจากไฟล์', desc: 'อัปโหลด PDF/Word/Excel แล้วตรวจเกรดรายวิชา', icon: 'check' },
    { key: 'schedule', label: 'จัดตาราง', desc: 'จัดตารางอัตโนมัติ ย้าย ปักหมุด ตรวจกฎ', icon: 'layers' },
  ];

  return (
    <>
      <PageHeader title="หน้าแรก" subtitle="งานตารางเรียนของแผนกคุณ" />
      <div className="home-grid">
        <div className="home-main">
          <div className="hero">
            {working
              ? <Button variant="primary" className="btn-lg" onClick={() => onOpen(working.id)}>ทำต่อ “{working.name}”</Button>
              : <Button variant="primary" className="btn-lg" onClick={onProfiles}>เริ่มตารางเรียนภาคนี้</Button>}
          </div>
          <div className="stats">
            <StatCard label="โปรไฟล์ทั้งหมด" value={rows.length} />
            <StatCard label="ขั้นล้าสมัย" value={stale.length} tone={stale.length ? 'warning' : 'success'} hint={stale.length ? 'ควรตรวจใหม่' : 'ไม่มีรายการค้าง'} />
            <StatCard label="ปีที่ยังไม่เริ่ม" value={notStarted.length} tone="info" />
          </div>
          <nav className="tile-grid" aria-label="ทางลัด">
            {shortcuts.map((t) => (
              <a key={t.key} className="tile" href={hrefFor({ key: t.key })}>
                <span className="tile-icon"><Icon name={t.icon} size={28} /></span>
                <strong>{t.label}</strong>
                <span className="muted">{t.desc}</span>
              </a>
            ))}
          </nav>
        </div>

        <section className="card" aria-label="สิ่งที่ต้องทำตอนนี้">
          <header className="card-head"><span className="head-icon"><Icon name="alert" size={18} /></span><h2>สิ่งที่ต้องทำตอนนี้</h2></header>
          {stale.length === 0 && notStarted.length === 0 ? (
            <EmptyState>ไม่มีรายการค้าง</EmptyState>
          ) : (
            <ul className="row-list">
              {stale.map(({ p, y }) => (
                <li key={y.id}>
                  <span className="tile-icon tone-warning"><Icon name="alert" /></span>
                  <span className="row-text">
                    {y.program} ปี {y.year} ของ “{p.name}” มี {y.steps.filter((s) => s === 'stale').length} ขั้นล้าสมัย
                  </span>
                  <Button variant="tertiary" onClick={() => onOpen(p.id)}>เปิด <Icon name="chevron" size={16} /></Button>
                </li>
              ))}
              {notStarted.map((y) => (
                <li key={y.id}>
                  <span className="tile-icon"><Icon name="calendar" /></span>
                  <span className="row-text">{y.program} ปี {y.year} ยังไม่เริ่ม</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
