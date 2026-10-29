// ไฟล์ครู (ไม่บังคับ): ใครสอนวิชาไหน เวลาที่สอนไม่ได้ ชั่วโมงสูงสุดต่อวัน — ตัวจัดจะไม่ให้ครูซ้อนหรืออยู่ในเวลาที่ไม่ว่าง
import { useEffect, useState } from 'react';
import { pickTeacherSample, removeTeacherFile, teacherSamples, uploadTeacherFile, type TeacherFile } from '../../api/schedule';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import InlineAlert from '../ui/InlineAlert';

interface Props { sid: string; file: TeacherFile | null; onChange: (f: TeacherFile | null) => void; onError: (m: string) => void }

export default function TeacherFileCard({ sid, file, onChange, onError }: Props) {
  const [samples, setSamples] = useState<string[]>([]);
  useEffect(() => { void teacherSamples().then(setSamples).catch(() => undefined); }, []);
  const run = (p: Promise<TeacherFile | null>) => {
    onError('');
    p.then(onChange).catch((e: unknown) => onError(e instanceof Error ? e.message : 'ไฟล์ครูใช้ไม่ได้'));
  };
  return (
    <Card title="ไฟล์ครู (ไม่บังคับ)">
      <p className="muted">
        ครูจะไม่ถูกจัดซ้อนและไม่ถูกจัดในเวลาที่ไม่ว่าง · ต้นแบบ <a href="/teachers-template.csv" download>teachers-template.csv</a>
      </p>
      <div className="field">
        <label htmlFor="teacher-file">อัปโหลดไฟล์ครู (CSV)</label>
        <input id="teacher-file" type="file" className="input" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(uploadTeacherFile(sid, f)); }} />
      </div>
      {samples.length > 0 && (
        <div className="actions">{samples.map((n) => <Button key={n} onClick={() => run(pickTeacherSample(sid, n))}>ตัวอย่าง: {n}</Button>)}</div>
      )}
      {file ? (
        <>
          <InlineAlert tone="success">
            {file.file}: ครู {file.teachers} คน สอน {file.subjects} วิชา
            {file.uncovered.length > 0 && ` · ${file.uncovered.length} วิชายังไม่มีครู (จัดได้ แต่ไม่ตรวจครู)`}
          </InlineAlert>
          {file.issues.length > 0 && <ul className="plain">{file.issues.map((i, n) => <li key={n}><Badge tone="warning">{i.th}</Badge></li>)}</ul>}
          <div className="actions"><Button onClick={() => run(removeTeacherFile(sid).then(() => null))}>เอาไฟล์ครูออก</Button></div>
        </>
      ) : <p className="muted">ยังไม่มีไฟล์ครู: จัดเฉพาะคาบของกลุ่มเรียน (ใส่ชื่อครูทีละคาบภายหลังได้)</p>}
    </Card>
  );
}
