// ขั้น 6: สร้าง + จัดตาราง ด้วยตัวจัดตารางจริงของ backend (FET) ต้อง acknowledge pre-check ก่อน (R4)
// ผลล่าสุดแปลงเป็น UiRun เก็บไว้ให้ขั้น 7–9 ใช้ (R5)
import { useEffect, useState } from 'react';
import { loadLastRun, saveLastRun, type UiRun } from '../../api/runs';
import { viewToUiRun } from '../../api/schedule';
import { getReport } from '../../api/rules';
import Schedule from '../../pages/Schedule';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import type { StepProps } from './types';

export default function GenerateStep({ profile, yearPlanId, done, locked, onComplete }: StepProps) {
  const [acked, setAcked] = useState<boolean | null>(null);
  const [run, setRun] = useState<UiRun | null>(() => loadLastRun(profile.id));

  useEffect(() => {
    let live = true;
    void getReport(profile.id).then((r) => { if (live) setAcked(Boolean(r?.acknowledged) || done); });
    return () => { live = false; };
  }, [profile.id, done]);

  if (acked === null) return <Skeleton lines={3} label="กำลังตรวจสถานะ pre-check" />;
  if (!acked) {
    return <InlineAlert tone="warning">ต้องรับทราบรายงาน pre-check ในขั้น 5 ก่อน จึงจะสร้างตารางได้</InlineAlert>;
  }

  const clash = run?.placed.filter((p) => p.status === 'conflict').length ?? 0;
  const unplaced = run?.unplaced.length ?? 0;
  const block = !run ? 'ยังไม่ได้สร้างตาราง' : clash ? `ยังมี ${clash} คาบที่ผิดกฎ` : unplaced ? `ยังมี ${unplaced} คาบที่ยังไม่ลง` : null;
  const year = profile.year_plans.find((y) => y.id === yearPlanId)?.year;

  return (
    <>
      <Schedule embedded year={year} onView={(v) => { const r = viewToUiRun(v); saveLastRun(profile.id, r); setRun(r); }} />
      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" onClick={() => void onComplete()} disabled={block !== null} title={block ?? undefined}>ยืนยันตารางนี้และไปขั้นถัดไป</Button>
          {block && <span className="muted">{block}</span>}
        </div>
      )}
    </>
  );
}
