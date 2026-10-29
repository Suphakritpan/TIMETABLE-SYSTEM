// ขั้น 2: ตรวจว่าข้อมูลพอจัดตารางได้ (ภาคเรียน เวลาเรียน อาจารย์ ห้อง) ผ่านเมื่อไม่มีรายการ block
import { useEffect, useState } from 'react';
import { checkReadiness, type Check } from '../../api/setup';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import Ingest from '../../pages/Ingest';
import type { StepProps } from './types';

const LEVEL = { ok: { tone: 'success', label: 'ผ่าน' }, warn: { tone: 'warning', label: 'ควรรู้' }, block: { tone: 'error', label: 'ต้องแก้' } } as const;

export default function DataCheckStep({ profile, yearPlanId, done, locked, onComplete }: StepProps) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    void checkReadiness(profile, yearPlanId).then((c) => { if (live) setChecks(c); });
    return () => { live = false; };
  }, [profile, yearPlanId, round]);
  if (!checks) return <Skeleton lines={4} label="กำลังตรวจข้อมูล" />;

  const blocks = checks.filter((c) => c.level === 'block').length;
  return (
    <>
      <ul className="checks" aria-label="ผลตรวจข้อมูล">
        {checks.map((c) => (
          <li key={c.id}><Badge tone={LEVEL[c.level].tone}>{LEVEL[c.level].label}</Badge> <strong>{c.label}</strong> <span className="muted">{c.detail}</span></li>
        ))}
      </ul>
      <Ingest embedded />
      <div className="actions">
        <Button onClick={() => { setChecks(null); setRound((n) => n + 1); }}>ตรวจอีกครั้ง</Button>
        {!done && !locked && <Button variant="primary" disabled={blocks > 0} title={blocks ? `ยังมี ${blocks} รายการที่ต้องแก้` : undefined} onClick={() => void onComplete()}>ข้อมูลพร้อม ไปขั้นถัดไป</Button>}
        {blocks > 0 && <span className="muted">ยังมี {blocks} รายการที่ต้องแก้</span>}
      </div>
    </>
  );
}
