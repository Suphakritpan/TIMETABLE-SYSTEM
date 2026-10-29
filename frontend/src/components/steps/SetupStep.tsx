// ขั้น 1: ตั้งค่าเวลาเรียนของ หลักสูตร × ชั้นปี นี้ — เพนต์สีบนตารางวัน × คาบว่าช่องไหนสอนได้/พัก/ไม่สอน
import { useEffect, useState } from 'react';
import { SCHOOL_DAYS, defaultSettings, getSettings, periodTimes, saveSettings, teachDays, type TimeSettings } from '../../api/setup';
import PaintGrid from '../timetable/PaintGrid';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { TextField } from '../ui/Field';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import type { StepProps } from './types';

export default function SetupStep({ yearPlanId, done, locked, onComplete, onEdit }: StepProps) {
  const [s, setS] = useState<TimeSettings | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    void getSettings(yearPlanId).then((v) => { if (live) setS(v ?? defaultSettings()); });
    return () => { live = false; };
  }, [yearPlanId]);
  if (!s) return <Skeleton lines={3} label="กำลังโหลดการตั้งค่า" />;

  const off = locked; // ขั้นที่เสร็จแล้วยังแก้ได้ (บันทึกแล้วขั้นหลังจะล้าสมัย) ยกเว้นเวอร์ชันที่เผยแพร่และถูกล็อก
  const num = (k: 'periods' | 'minutes') => (e: { target: { value: string } }) => setS({ ...s, [k]: Number(e.target.value) });
  const save = async () => {
    setErr('');
    try {
      if (done && onEdit) onEdit(async () => { await saveSettings(yearPlanId, s); }); else { await saveSettings(yearPlanId, s); await onComplete(); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
  };
  const valid = Number.isInteger(s.periods) && s.periods >= 1 && s.periods <= 12 && /^\d{2}:\d{2}$/.test(s.start) && s.minutes >= 30 && s.minutes <= 120;
  const times = valid ? periodTimes(s) : [];
  const teach = Object.entries(s.grid).filter(([k, v]) => v === 'teach' && Number(k.split(':')[1]) <= s.periods).length;

  return (
    <>
      {err && <InlineAlert tone="error">{err}</InlineAlert>}
      <div className="filter-grid">
        <TextField label="จำนวนคาบต่อวัน" type="number" min={1} max={12} value={s.periods} disabled={off} onChange={num('periods')} />
        <TextField label="เวลาเริ่มคาบที่ 1" type="time" value={s.start} disabled={off} onChange={(e) => setS({ ...s, start: e.target.value })} />
        <TextField label="ความยาวคาบ (นาที)" type="number" min={30} max={120} value={s.minutes} disabled={off} onChange={num('minutes')} />
      </div>
      {valid && <PaintGrid days={SCHOOL_DAYS} periods={times} value={s.grid} onChange={(grid) => setS({ ...s, grid })} disabled={off} />}
      <p className="muted"><Badge tone="info">{teachDays(s)} วันที่สอน</Badge> <Badge tone="success">{teach} คาบสอนได้ต่อสัปดาห์</Badge> ช่องที่ไม่ทาสี = ไม่สอน (เช่น วันหยุด)</p>
      {!off && <div className="actions"><Button variant="primary" onClick={() => void save()}>{done ? 'บันทึกการแก้ไข' : 'บันทึกและทำขั้นนี้เสร็จ'}</Button></div>}
    </>
  );
}
