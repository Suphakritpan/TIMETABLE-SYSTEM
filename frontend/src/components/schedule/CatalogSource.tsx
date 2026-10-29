// เลือกวิชาจากหลักสูตรในระบบ (ชั้นปี × ภาค) แล้วส่งให้ backend จัดตาราง — ทางเข้าที่ไม่ต้องอัปโหลดไฟล์
import { useEffect, useState } from 'react';
import { getCatalog, type Institution } from '../../api/structure';
import { curriculumCsv } from '../../api/schedule';
import Button from '../ui/Button';
import { SelectField } from '../ui/Field';
import Skeleton from '../ui/Skeleton';

interface Props { defaultYear?: number; defaultTerm?: number; onOpen: (csv: string, name: string) => void }

export default function CatalogSource({ defaultYear = 1, defaultTerm = 1, onOpen }: Props) {
  const [cat, setCat] = useState<Institution[] | null>(null);
  const [inst, setInst] = useState(0);
  const [dept, setDept] = useState(0);
  const [cur, setCur] = useState(0);
  const [year, setYear] = useState(defaultYear);
  const [term, setTerm] = useState(defaultTerm);
  useEffect(() => { void getCatalog().then(setCat); }, []);
  if (!cat) return <Skeleton lines={3} label="กำลังโหลดหลักสูตร" />;

  const i = cat[inst];
  const d = i?.departments[dept];
  const c = d?.curricula[cur];
  const years = [...new Set(c?.courses.map((x) => x.y) ?? [])].sort();
  const count = c ? c.courses.filter((x) => x.y === year && Number(x.t) === term && x.kind !== 'elective_slot').length : 0;
  return (
    <div className="form-row">
      <SelectField label="สถานศึกษา" value={inst} onChange={(e) => { setInst(Number(e.target.value)); setDept(0); setCur(0); }}>
        {cat.map((x, n) => <option key={x.id} value={n}>{x.name}</option>)}
      </SelectField>
      <SelectField label="แผนก / สาขา" value={dept} onChange={(e) => { setDept(Number(e.target.value)); setCur(0); }}>
        {i?.departments.map((x, n) => <option key={x.id} value={n}>{x.name}</option>)}
      </SelectField>
      <SelectField label="หลักสูตร" value={cur} onChange={(e) => setCur(Number(e.target.value))}>
        {d?.curricula.map((x, n) => <option key={`${x.plan}`} value={n}>{x.plan} · {x.year ?? ''} · {x.variant}</option>)}
      </SelectField>
      <SelectField label="ชั้นปี" value={year} onChange={(e) => setYear(Number(e.target.value))}>
        {(years.length ? years : [1]).map((y) => <option key={y} value={y}>ชั้นปีที่ {y}</option>)}
      </SelectField>
      <SelectField label="ภาคเรียน" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
        <option value={1}>ภาค 1</option><option value={2}>ภาค 2</option><option value={3}>ฤดูร้อน</option>
      </SelectField>
      <Button variant="primary" disabled={!c || count === 0} title={count === 0 ? 'ชั้นปี/ภาคนี้ไม่มีวิชา' : undefined}
        onClick={() => c && onOpen(curriculumCsv(c, year, term), `${c.plan}-ปี${year}-ภาค${term}.csv`)}>ใช้ {count} วิชานี้</Button>
    </div>
  );
}
