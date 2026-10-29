// โครงสร้างสถานศึกษา: แผนกวิชา -> รายวิชา + บุคลากร ดูได้ทุกบทบาท (อ่านอย่างเดียว)
import { useEffect, useState } from 'react';
import { getStructure, type DepartmentStructure } from '../api/structure';
import Badge from '../components/ui/Badge';
import InlineAlert from '../components/ui/InlineAlert';
import PageHeader from '../components/ui/PageHeader';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';
import { term } from '../utils/terminology';

const ROLE_LABEL = { HEAD: 'หัวหน้า', ASSISTANT: 'ผู้ช่วย', TEACHER: 'อาจารย์' } as const;

export default function Structure() {
  const { institutionType } = useSession();
  const depLabel = term(institutionType, 'department');
  const [rows, setRows] = useState<DepartmentStructure[] | null>(null);
  useEffect(() => { let live = true; void getStructure().then((r) => { if (live) setRows(r); }); return () => { live = false; }; }, []);
  if (!rows) return <Skeleton lines={4} label="กำลังโหลดโครงสร้าง" />;
  if (!rows.length) return <InlineAlert tone="info">ยังไม่มี{depLabel}</InlineAlert>;
  return (
    <>
    <PageHeader title="โครงสร้าง" subtitle={`${depLabel}ทั้งหมดของสถาบัน รายวิชา และบุคลากร`} />
    <div className="stack">
      {rows.map((d) => (
        <details key={d.id} className="card">
          <summary>
            <strong>{d.name}</strong> <Badge tone="info">{d.subjects.length} วิชา</Badge> <Badge tone="neutral">{d.people.length} คน</Badge>
          </summary>
          <h3>รายวิชา</h3>
          {d.subjects.length ? <ul>{d.subjects.map((s) => <li key={s.code}>{s.code} · {s.name}</li>)}</ul> : <p>ยังไม่มีวิชา</p>}
          <h3>บุคลากร</h3>
          {d.people.length
            ? <ul>{d.people.map((p) => <li key={p.id}>{p.status === 'invited' ? p.email : p.name} <Badge tone={p.status === 'invited' ? 'warning' : 'neutral'}>{ROLE_LABEL[p.role]}{p.status === 'invited' ? ' (รอตอบรับ)' : ''}</Badge></li>)}</ul>
            : <p>ยังไม่มีบุคลากร</p>}
        </details>
      ))}
    </div>
    </>
  );
}
