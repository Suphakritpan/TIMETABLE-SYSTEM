// ขั้น 6: Generate + จัดตาราง. ต้อง acknowledge pre-check ก่อน (R4) ผลรันล่าสุดเก็บไว้ (R5)
// ลาก/ปักหมุด/ตรวจสด (T3.6 รอบ 2–3) ยังไม่ทำ: ต้องรอ POST /api/check ของ backend
import { useEffect, useState } from 'react';
import { generate, loadLastRun, saveLastRun, type UiRun } from '../../api/runs';
import { assertAcknowledged, getReport } from '../../api/rules';
import Timetable from '../../pages/Timetable';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import type { StepProps } from './types';

export default function GenerateStep({ profile, done, locked, onComplete, setStatus }: StepProps) {
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
  const block = !run ? 'ยังไม่ได้สร้างตาราง' : clash ? `ยังมี ${clash} คาบที่ชน` : unplaced ? `ยังมี ${unplaced} คาบที่ยังไม่ลง` : null;

  return (
    <>
      <Timetable
        embedded
        setStatus={setStatus}
        initial={run}
        generate={async () => { assertAcknowledged(profile.id); return generate(); }}
        onRun={(r) => { saveLastRun(profile.id, r); setRun(r); }}
      />
      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" onClick={() => void onComplete()} disabled={block !== null} title={block ?? undefined}>ยืนยันตารางนี้และไปขั้นถัดไป</Button>
          {block && <span className="muted">{block}</span>}
        </div>
      )}
    </>
  );
}
