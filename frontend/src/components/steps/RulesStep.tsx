// ขั้น 5: กฎ + pre-check + Acknowledge (flows F7). Acknowledge ปลดล็อกขั้น 6 และบันทึกกับการรัน (R4)
import { PRECHECK_RESULT } from '../../profile/status';
import { useEffect, useState } from 'react';
import { listRooms } from '../../api/people';
import { acknowledge, getReport, getRules, putRules, runCheck } from '../../api/rules';
import { RISKY_WEIGHT, type PrecheckReport, type RulesState } from '../../profile/precheck';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import type { StepProps } from './types';

export default function RulesStep({ profile, done, locked, onComplete }: StepProps) {
  const toast = useToast();
  const [saved, setSaved] = useState<RulesState | null>(null);
  const [draft, setDraft] = useState<RulesState | null>(null);
  const [report, setReport] = useState<PrecheckReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomCount, setRoomCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    // จำนวนห้องนับจากรายการห้องของแผนก (ไม่ให้กรอกซ้ำ): ถ้าไม่ตรงกับที่เก็บในกฎ ให้ซิงก์ค่ากฎให้ตรง
    void Promise.all([getRules(profile.id), getReport(profile.id), listRooms(profile.department_id)]).then(async ([r, rep, rooms]) => {
      const synced = r.rooms === rooms.length ? r : await putRules(profile.id, { ...r, rooms: rooms.length });
      if (!live) return;
      setRoomCount(rooms.length);
      setSaved(synced);
      setDraft(synced);
      setReport(synced === r ? rep : null);
    });
    return () => { live = false; };
  }, [profile.id, profile.department_id]);

  if (!draft || !saved) return <Skeleton lines={4} label="กำลังโหลดกฎ" />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const edit = (patch: Partial<RulesState>) => setDraft({ ...draft, ...patch });
  const setSoft = (key: string, patch: { enabled?: boolean; weight?: number }) =>
    edit({ soft: draft.soft.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });

  const save = async () => {
    setBusy(true);
    try {
      const r = await putRules(profile.id, draft);
      setSaved(r);
      setReport(null); // แก้กฎแล้วรายงานเดิมใช้ไม่ได้ ต้อง Check ใหม่
      toast.show('บันทึกกฎแล้ว ต้อง Check ใหม่');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true);
    try { setReport(await runCheck(profile.id)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const ack = async () => {
    if (!report) return;
    setBusy(true);
    try {
      setReport(await acknowledge(profile.id, report.id));
      toast.show('รับทราบรายงานแล้ว ปลดล็อกการสร้างตาราง');
      await onComplete();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const off = locked;
  return (
    <>
      <div className="grid-2">
        <fieldset className="field" disabled={off}>
          <legend>ตารางเวลาและทรัพยากร</legend>
          <label className="field">คาบต่อวัน
            <input className="input" type="number" min={1} max={12} value={draft.periodsPerDay} onChange={(e) => edit({ periodsPerDay: Number(e.target.value) })} />
          </label>
          <p>จำนวนห้อง: <strong>{roomCount ?? '…'}</strong> <span className="muted">(นับจากรายการห้องของแผนก ต้องมีก่อนจัดตาราง) <a href="#/people">จัดการห้อง</a></span></p>
          <p className="muted">วันเรียนต่อสัปดาห์: {draft.days} วัน</p>
        </fieldset>

        <div>
          <h3>กฎที่ต้องทำตาม (hard) <span className="muted">จากหลักสูตร แก้ไม่ได้</span></h3>
          <ul>{draft.hard.map((h) => <li key={h.key}>🔒 {h.label}</li>)}</ul>
        </div>
      </div>

      <fieldset className="field" disabled={off}>
        <legend>กฎที่ปรับได้ (soft)</legend>
        {draft.soft.map((r) => (
          <div key={r.key} className="rule-row">
            <label>
              <input type="checkbox" checked={r.enabled} onChange={(e) => setSoft(r.key, { enabled: e.target.checked })} /> {r.label}
            </label>
            <label>น้ำหนัก
              <input className="input w-num" aria-label={`น้ำหนัก ${r.label}`} type="number" min={0} max={10} value={r.weight} disabled={!r.enabled} onChange={(e) => setSoft(r.key, { weight: Math.min(10, Math.max(0, Number(e.target.value))) })} />
            </label>
            {r.enabled && r.weight >= RISKY_WEIGHT && <Badge tone="warning">เสี่ยงลงไม่ครบ</Badge>}
          </div>
        ))}
      </fieldset>

      <div className="actions">
        <Button onClick={() => void save()} disabled={!dirty || busy || off}>บันทึกกฎ</Button>
        <Button variant="primary" onClick={() => void check()} disabled={dirty || busy || off} title={dirty ? 'บันทึกกฎก่อนจึงจะ Check ได้' : undefined}>Check</Button>
      </div>

      {report && (
        <section className="panel" aria-label="รายงาน pre-check">
          <h3>รายงาน pre-check <Badge tone={PRECHECK_RESULT[report.result].tone}>{PRECHECK_RESULT[report.result].label}</Badge></h3>
          {report.items.length === 0 ? <p>ไม่พบปัญหา</p> : (
            <ul>
              {report.items.map((it) => (
                <li key={it.text}>
                  <span aria-hidden="true">{it.severity === 'problem' ? '✕ ' : '⚠ '}</span><b>{it.text}</b>
                  {it.reason && <><br /><small>เหตุผล: {it.reason}</small></>}
                  {it.fix && <><br /><small>วิธีแก้ใกล้สุด: {it.fix}</small></>}
                </li>
              ))}
            </ul>
          )}
          {report.result === 'problems'
            ? <InlineAlert tone="error">แก้กฎด้านบนแล้วกด Check ใหม่ จึงจะรับทราบและสร้างตารางได้</InlineAlert>
            : report.acknowledged
              ? <InlineAlert tone="success">รับทราบแล้ว การสร้างตาราง (ขั้น 6) ปลดล็อก</InlineAlert>
              : <Button variant="primary" onClick={() => void ack()} disabled={busy || off}>รับทราบรายงานและไปขั้นถัดไป</Button>}
        </section>
      )}
      {done && !report && <InlineAlert tone="info">ขั้นนี้เคยเสร็จแล้ว แก้กฎแล้วต้อง Check และรับทราบใหม่</InlineAlert>}
    </>
  );
}
