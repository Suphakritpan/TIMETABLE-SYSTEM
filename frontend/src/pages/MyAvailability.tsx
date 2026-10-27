// 4.2 เวลาว่างของฉัน: ตารางไม่ว่างรายสัปดาห์ + ชั่วโมงสอนสูงสุดต่อวัน กรอกครั้งเดียวต่อคนต่อภาค (D5) แก้ได้จนถึงกำหนดส่ง → ใบรับ
// ❓ การจัดอันดับวิชา และช่อง "ไม่ว่างที่แผนกอื่น" ยังไม่ทำ (รอ API วิชาที่แผนกเปิด)
import { useEffect, useState } from 'react';
import { getAvailability, myRounds, saveAvailability, statusOf, submitRound, type Receipt, type Round } from '../api/availability';
import { listTerms } from '../api/profiles';
import AvailabilityGrid from '../components/timetable/AvailabilityGrid';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { DAYS, PERIODS } from '../data/sample';
import { useSession } from '../context/Session';
import { termLabel } from '../utils/buddhistEra';

export default function MyAvailability() {
  const toast = useToast();
  const { user } = useSession();
  const uid = user?.id ?? '';
  const [ctx, setCtx] = useState<{ round: Round; termText: string; profileName: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState<string[]>([]);
  const [max, setMax] = useState(6);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [sent, setSent] = useState(false);
  const [openedAt] = useState(() => Date.now()); // เวลาที่เปิดหน้า ใช้ตัดสินว่าเลยกำหนดหรือยัง
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const [rounds, terms] = await Promise.all([myRounds(uid), listTerms()]);
      const first = rounds[0];
      if (!first) { if (live) setCtx(null); return; }
      const a = await getAvailability(uid, first.round.term_id);
      if (!live) return;
      const t = terms.find((x) => x.id === first.round.term_id);
      setCtx({ round: first.round, termText: t ? termLabel(t) : first.round.term_id, profileName: first.profileName });
      if (a) { setBusy(a.busy); setMax(a.maxHoursPerDay); }
    })();
    return () => { live = false; };
  }, [uid]);

  if (ctx === undefined) return <><div className="toolbar"><h1>เวลาว่างของฉัน</h1></div><Skeleton lines={5} label="กำลังโหลด" /></>;
  if (ctx === null) return <><div className="toolbar"><h1>เวลาว่างของฉัน</h1></div><EmptyState>ยังไม่มีรอบสอบถามเวลาว่างที่ต้องตอบ</EmptyState></>;

  const { round } = ctx;
  const responded = Boolean(round.responses[uid]) || sent;
  const status = statusOf(round, uid, openedAt);
  const afterDeadline = openedAt > round.deadline && responded;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await saveAvailability(uid, round.term_id, { busy, maxHoursPerDay: max });
      const r = await submitRound(round.id, uid);
      setReceipt(r);
      setSent(true);
      toast.show('ส่งเวลาว่างแล้ว');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <h1>เวลาว่างของฉัน</h1>
        <span className="muted">ภาคเรียน {ctx.termText} · {ctx.profileName}</span>
        <span className="spacer" />
        <Badge tone={status === 'submitted' || status === 'any_time' || status === 'filled_by_head' ? 'success' : status === 'late' ? 'error' : 'neutral'}>
          {status === 'late' ? 'ล่าช้า' : responded ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}
        </Badge>
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {afterDeadline && <InlineAlert tone="warning">เลยกำหนดส่งแล้ว แก้ไขเองไม่ได้ ขอให้หัวหน้าแก้ให้</InlineAlert>}
      {receipt && <InlineAlert tone="success">{receipt.message}</InlineAlert>}
      <p className="muted">กดช่องที่ <b>ไม่ว่าง</b> (✕) กรอกครั้งเดียวต่อภาคเรียน ใช้ร่วมทุกแผนกที่คุณสังกัด</p>
      <AvailabilityGrid days={DAYS} periods={PERIODS} busy={busy} onChange={setBusy} disabled={afterDeadline} />
      <label className="field narrow">ชั่วโมงสอนสูงสุดต่อวัน
        <input className="input" type="number" min={1} max={12} value={max} disabled={afterDeadline} onChange={(e) => setMax(Number(e.target.value))} />
      </label>
      <div className="actions">
        <Button variant="primary" onClick={() => void submit()} disabled={saving || afterDeadline}>{responded ? 'บันทึกการแก้ไข' : 'ส่งเวลาว่าง'}</Button>
        <span className="muted">ไม่ว่าง {busy.length} คาบ</span>
      </div>
    </>
  );
}
