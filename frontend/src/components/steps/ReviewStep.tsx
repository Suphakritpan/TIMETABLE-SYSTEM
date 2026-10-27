// ขั้น 8: อาจารย์ตรวจทาน (flows F9) — ส่งเข้า REVIEW → คำขอเปลี่ยน (เห็นผลกระทบ) → อนุมัติ/ปฏิเสธ + direct edit "ตกลงกับ ___"
import { REQUEST_STATUS } from '../../profile/status';
import { useCallback, useEffect, useState } from 'react';
import { sendToReview } from '../../api/profiles';
import { decideRequest, directEdit, listLog, listRequests, type ChangeLogEntry, type ChangeRequest } from '../../api/review';
import { loadLastRun } from '../../api/runs';
import { listPeople, type Person } from '../../api/people';
import { DAYS, PERIODS } from '../../data/sample';
import { useSession } from '../../context/Session';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable, { type Column } from '../ui/DataTable';
import Dialog from '../ui/Dialog';
import EmptyState from '../ui/EmptyState';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import type { StepProps } from './types';

export default function ReviewStep({ profile, done, locked, onComplete, onProfile }: StepProps) {
  const toast = useToast();
  const { user } = useSession();
  const [reqs, setReqs] = useState<ChangeRequest[] | null>(null);
  const [log, setLog] = useState<ChangeLogEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [reject, setReject] = useState<ChangeRequest | null>(null);
  const [note, setNote] = useState('');
  const [rejectErr, setRejectErr] = useState('');
  const [edit, setEdit] = useState({ classId: '', day: 0, start: 1, agreed: '' });
  const [editErr, setEditErr] = useState('');
  const run = loadLastRun(profile.id);
  const inReview = profile.status === 'review';

  const reload = useCallback(async () => {
    const [r, l] = await Promise.all([listRequests(profile.id), listLog(profile.id)]);
    setReqs(r);
    setLog(l);
  }, [profile.id]);
  useEffect(() => {
    let live = true;
    void Promise.all([listRequests(profile.id), listLog(profile.id), listPeople(profile.department_id)]).then(([r, l, p]) => {
      if (!live) return;
      setReqs(r);
      setLog(l);
      setPeople(p);
    });
    return () => { live = false; };
  }, [profile.id, profile.department_id]);

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const classOf = (id: string) => run?.placed.find((p) => p.id === id);

  if (profile.status === 'draft') {
    return (
      <>
        <p>ส่งตารางให้{'ครู'}ตรวจ: อาจารย์จะเห็นเฉพาะคาบของตัวเอง (ป้าย DRAFT) และขอเปลี่ยนได้</p>
        <Button variant="primary" disabled={locked} onClick={() => void sendToReview(profile.id).then((p) => { onProfile(p); toast.show('ส่งเข้าตรวจทานแล้ว'); }).catch(fail)}>ส่งเข้าตรวจทาน</Button>
      </>
    );
  }
  if (!reqs) return <Skeleton lines={3} label="กำลังโหลดคำขอ" />;

  const waiting = reqs.filter((r) => r.status === 'waiting');
  const approve = async (r: ChangeRequest) => { try { await decideRequest(r.id, user?.id ?? '', { approve: true, note: '' }); toast.show('อนุมัติแล้ว แจ้งอาจารย์แล้ว'); await reload(); } catch (e) { fail(e); } };
  const confirmReject = async () => {
    if (!reject) return;
    setRejectErr('');
    try { await decideRequest(reject.id, user?.id ?? '', { approve: false, note }); setReject(null); setNote(''); toast.show('ปฏิเสธแล้ว แจ้งอาจารย์แล้ว'); await reload(); } catch (e) { setRejectErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); }
  };
  const doEdit = async () => {
    if (!user) return;
    setEditErr('');
    try {
      await directEdit(profile.id, { id: user.id, name: user.name }, edit.classId, { day: edit.day, start: edit.start }, edit.agreed);
      toast.show('แก้แล้ว แจ้งอาจารย์ที่ได้รับผลกระทบ');
      setEdit({ ...edit, agreed: '' });
      await reload();
    } catch (e) { setEditErr(e instanceof Error ? e.message : 'แก้ไม่สำเร็จ'); }
  };

  const columns: Column<ChangeRequest>[] = [
    { key: 'who', header: 'ใคร', render: (r) => nameOf(r.requested_by) },
    { key: 'cls', header: 'คาบ', render: (r) => { const c = classOf(r.class_id); return c ? `${c.code} ${DAYS[c.day]} คาบ ${c.start}` : r.class_id; } },
    { key: 'reason', header: 'เหตุผล', render: (r) => r.reason },
    { key: 'impact', header: 'ผลกระทบ', render: (r) => r.impact },
    { key: 'st', header: 'สถานะ', sortValue: (r) => r.status, render: (r) => <><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>{r.decision_note && <small> {r.decision_note}</small>}</> },
    {
      key: 'act', header: 'คำสั่ง',
      render: (r) => r.status === 'waiting' && !locked && (
        <>
          <Button variant="tertiary" onClick={() => void approve(r)}>อนุมัติ</Button>
          <Button variant="tertiary" onClick={() => { setReject(r); setRejectErr(''); }}>ปฏิเสธ</Button>
        </>
      ),
    },
  ];

  return (
    <>
      {inReview && <InlineAlert tone="info">อยู่ในขั้นตรวจทาน อาจารย์เห็นเฉพาะคาบของตัวเอง (DRAFT)</InlineAlert>}
      <h3>คำขอเปลี่ยนจากอาจารย์ ({waiting.length} รอตัดสิน)</h3>
      <DataTable columns={columns} rows={reqs} rowKey={(r) => r.id} caption="คำขอเปลี่ยน" empty="ยังไม่มีคำขอเปลี่ยน" />

      {run && !locked && (
        <fieldset className="field">
          <legend>แก้ตรง ๆ (direct edit)</legend>
          {editErr && <InlineAlert tone="error">{editErr}</InlineAlert>}
          <label>คาบ
            <select className="input" value={edit.classId} onChange={(e) => { const c = classOf(e.target.value); setEdit({ ...edit, classId: e.target.value, day: c?.day ?? 0, start: c?.start ?? 1 }); }}>
              <option value="">เลือกคาบ…</option>
              {run.placed.map((c) => <option key={c.id} value={c.id}>{c.code} · {DAYS[c.day]} คาบ {c.start}</option>)}
            </select>
          </label>
          <label>ย้ายไปวัน
            <select className="input" value={edit.day} onChange={(e) => setEdit({ ...edit, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </label>
          <label>คาบเริ่ม
            <select className="input" value={edit.start} onChange={(e) => setEdit({ ...edit, start: Number(e.target.value) })}>{PERIODS.map((p) => <option key={p.no} value={p.no}>{p.no}</option>)}</select>
          </label>
          <label>ตกลงกับ
            <input className="input" value={edit.agreed} onChange={(e) => setEdit({ ...edit, agreed: e.target.value })} />
          </label>
          <Button disabled={!edit.classId} onClick={() => void doEdit()}>แก้ตรง ๆ</Button>
        </fieldset>
      )}

      <h3>บันทึกการเปลี่ยนแปลง</h3>
      {log.length === 0 ? <EmptyState>ยังไม่มีการแก้ไข</EmptyState> : (
        <ul>{log.map((l) => <li key={l.id}>{l.class_code}: {DAYS[l.old_value.day]} คาบ {l.old_value.start} → {DAYS[l.new_value.day]} คาบ {l.new_value.start} · ตกลงกับ {l.agreed_with} · โดย {nameOf(l.changed_by)}</li>)}</ul>
      )}

      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" disabled={waiting.length > 0} title={waiting.length ? `ยังมี ${waiting.length} คำขอที่รอตัดสิน` : undefined} onClick={() => void onComplete()}>เสร็จขั้นตรวจทาน</Button>
          {waiting.length > 0 && <span className="muted">ตัดสินคำขอให้ครบก่อน</span>}
        </div>
      )}

      <Dialog open={reject !== null} title="ปฏิเสธคำขอ" onClose={() => setReject(null)} footer={<><Button onClick={() => setReject(null)}>ยกเลิก</Button><Button variant="destructive" onClick={() => void confirmReject()}>ปฏิเสธคำขอ</Button></>}>
        {rejectErr && <InlineAlert tone="error">{rejectErr}</InlineAlert>}
        <label className="field">หมายเหตุถึงอาจารย์ (จำเป็น)
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Dialog>
    </>
  );
}
