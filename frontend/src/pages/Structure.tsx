// โครงสร้างสถานศึกษา ดูได้ทุกบทบาท (อ่านอย่างเดียว): หลักสูตร/รายวิชา เลือกไล่ลงมา สถานศึกษา > แผนก > รุ่นปีหลักสูตร > ชั้นปี และแผนก+บุคลากร
import { useEffect, useMemo, useState } from 'react';
import { getCatalog, getStructure, type Course, type CurriculumRow, type DepartmentPeople, type Institution } from '../api/structure';
import Badge from '../components/ui/Badge';
import DataTable, { type Column } from '../components/ui/DataTable';
import { SelectField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import PageHeader from '../components/ui/PageHeader';
import Skeleton from '../components/ui/Skeleton';
import Tabs from '../components/ui/Tabs';
import { useSession } from '../context/Session';
import { term } from '../utils/terminology';

const ROLE_LABEL = { HEAD: 'หัวหน้า', ASSISTANT: 'ผู้ช่วย', TEACHER: 'อาจารย์' } as const;
const TERM_LABEL = (t: string) => (t === '3' ? 'ภาคฤดูร้อน' : `ภาคเรียนที่ ${t}`);
const KIND = { course: 'วิชา', activity: 'กิจกรรม', elective_slot: 'วิชาเลือก' } as const;
const pick = <T extends { id: string }>(xs: T[], id: string): T | undefined => xs.find((x) => x.id === id) ?? xs[0];
const credits = (xs: Course[]) => xs.filter((c) => c.kind === 'course').reduce((n, c) => n + c.cr, 0);
const planLabel = (p: CurriculumRow) => `${p.year ? `รุ่นปี ${p.year}` : 'ไม่ระบุรุ่นปี'} · หลักสูตร ${p.variant} (${p.courses.length} รายการ)`;

export default function Structure() {
  const { institutionType } = useSession();
  const depLabel = term(institutionType, 'department');
  const [tab, setTab] = useState('courses');
  return (
    <>
      <PageHeader title="โครงสร้าง" subtitle={`หลักสูตร รายวิชา ${depLabel} และบุคลากรของสถานศึกษา`} />
      <Tabs label="มุมมองโครงสร้าง" value={tab} onChange={setTab} tabs={[{ key: 'courses', label: 'หลักสูตรและรายวิชา' }, { key: 'people', label: `${depLabel}และบุคลากร` }]}>
        {tab === 'courses' ? <Catalog /> : <People depLabel={depLabel} />}
      </Tabs>
    </>
  );
}

function Catalog() {
  const [data, setData] = useState<Institution[] | null>(null);
  const [inst, setInst] = useState('');
  const [dept, setDept] = useState('');
  const [plan, setPlan] = useState('');
  const [year, setYear] = useState('1');
  useEffect(() => { let live = true; void getCatalog().then((c) => { if (live) setData(c); }); return () => { live = false; }; }, []);

  const i = data && pick(data, inst);
  const d = i && pick(i.departments, dept);
  const cur = d && (d.curricula.find((c) => c.plan === plan) ?? d.curricula[0]);
  const years = useMemo(() => [...new Set(cur?.courses.map((c) => c.y) ?? [])].sort(), [cur]);
  const y = years.includes(Number(year)) ? Number(year) : years[0];

  if (!data) return <Skeleton lines={5} label="กำลังโหลดหลักสูตร" />;
  if (!i || !d || !cur) return <InlineAlert tone="info">ยังไม่มีข้อมูลหลักสูตร</InlineAlert>;

  const inYear = cur.courses.filter((c) => c.y === y);
  const terms = [...new Set(inYear.map((c) => c.t))].sort();
  const cols: Column<Course>[] = [
    { key: 'code', header: 'รหัสวิชา', render: (c) => c.code },
    { key: 'name', header: 'ชื่อวิชา', render: (c) => <>{c.name}{c.check && <> <Badge tone="warning">ตรวจรหัสอีกครั้ง</Badge></>}</> },
    { key: 'kind', header: 'ประเภท', render: (c) => <Badge tone={c.kind === 'course' ? 'neutral' : 'info'}>{KIND[c.kind]}</Badge> },
    { key: 'lec', header: 'ทฤษฎี', align: 'right', render: (c) => c.lec },
    { key: 'lab', header: 'ปฏิบัติ', align: 'right', render: (c) => c.lab },
    { key: 'cr', header: 'หน่วยกิต', align: 'right', render: (c) => c.cr },
  ];

  return (
    <div className="stack">
      <div className="filter-grid">
        <SelectField label="สถานศึกษา" value={i.id} onChange={(e) => { setInst(e.target.value); setDept(''); setPlan(''); }}>
          {data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </SelectField>
        <SelectField label="แผนก / สาขา" value={d.id} onChange={(e) => { setDept(e.target.value); setPlan(''); }}>
          {i.departments.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.curricula.length} หลักสูตร)</option>)}
        </SelectField>
        <SelectField label="รุ่นปีหลักสูตร" value={cur.plan} onChange={(e) => setPlan(e.target.value)}>
          {d.curricula.map((p) => <option key={p.plan} value={p.plan}>{planLabel(p)}</option>)}
        </SelectField>
      </div>
      <p className="muted">
        ระดับ {i.level} · รหัสหลักสูตร {cur.plan} · รวม {credits(cur.courses)} หน่วยกิต
        {d.hint.length > 0 && <> · วิชาชีพ เช่น {d.hint.join(', ')}</>}
      </p>
      <Tabs label="ชั้นปี" value={String(y)} onChange={setYear} tabs={years.map((n) => ({ key: String(n), label: `ชั้นปีที่ ${n}` }))}>
        {terms.map((t) => {
          const rows = inYear.filter((c) => c.t === t);
          return (
            <section key={t} aria-label={TERM_LABEL(t)} className="stack">
              <h2>{TERM_LABEL(t)} <Badge tone="info">{credits(rows)} หน่วยกิต</Badge></h2>
              <DataTable caption={`${TERM_LABEL(t)} ชั้นปีที่ ${y}`} columns={cols} rows={rows} rowKey={(c) => `${c.code}-${rows.indexOf(c)}`} />
            </section>
          );
        })}
      </Tabs>
    </div>
  );
}

function People({ depLabel }: { depLabel: string }) {
  const [rows, setRows] = useState<DepartmentPeople[] | null>(null);
  useEffect(() => { let live = true; void getStructure().then((r) => { if (live) setRows(r); }); return () => { live = false; }; }, []);
  if (!rows) return <Skeleton lines={4} label="กำลังโหลดบุคลากร" />;
  if (!rows.length) return <InlineAlert tone="info">ยังไม่มี{depLabel}</InlineAlert>;
  return (
    <div className="stack">
      {rows.map((d) => (
        <details key={d.id} className="card" open>
          <summary><strong>{d.name}</strong> <Badge tone="neutral">{d.people.length} คน</Badge></summary>
          {d.people.length
            ? <ul>{d.people.map((p) => <li key={p.id}>{p.status === 'invited' ? p.email : p.name} <Badge tone={p.status === 'invited' ? 'warning' : 'neutral'}>{ROLE_LABEL[p.role]}{p.status === 'invited' ? ' (รอตอบรับ)' : ''}</Badge></li>)}</ul>
            : <p>ยังไม่มีบุคลากร</p>}
        </details>
      ))}
    </div>
  );
}
