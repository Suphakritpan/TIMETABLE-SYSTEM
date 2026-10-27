// ขั้น 3: รอบสอบถามเวลาว่าง (flows F5 ฝั่งหัวหน้า): เลือกอาจารย์ → กำหนดส่ง → เปิดรอบ → กระดานสถานะ → เตือน/กรอกแทน
// ขั้นเสร็จเมื่อทุกอาจารย์ที่เลือกมีคำตอบ
import { RESPONSE_STATUS } from '../../profile/status';
import { useCallback, useEffect, useState } from 'react';
import { fillForTeacher, getRound, openRound, remind, roundComplete, type BoardRow, type Round } from '../../api/availability';
import { listPeople, type Person } from '../../api/people';
import { useSession } from '../../context/Session';
import { term } from '../../utils/terminology';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable, { type Column } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import { TextField } from '../ui/Field';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import type { StepProps } from './types';

const endOfDay = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T23:59:59`).getTime();
const fmt = (ms: number) => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AvailabilityStep({ profile, done, locked, onComplete }: StepProps) {
  const toast = useToast();
  const { user, institutionType } = useSession();
  const teacher = term(institutionType, 'teacher');
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [state, setState] = useState<{ round: Round; board: BoardRow[] } | null | undefined>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(async () => setState(await getRound(profile.id)), [profile.id]);
  useEffect(() => {
    let live = true;
    void Promise.all([getRound(profile.id), listPeople(profile.department_id)]).then(([r, p]) => {
      if (!live) return;
      setState(r);
      setTeachers(p.filter((x) => x.role === 'TEACHER' && x.status === 'joined'));
    });
    return () => { live = false; };
  }, [profile.id, profile.department_id]);

  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.name ?? id;
  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });

  if (state === undefined) return <Skeleton lines={4} label="กำลังโหลดรอบเวลาว่าง" />;

  if (state === null) {
    const open = async () => {
      setErr('');
      try {
        await openRound(profile.id, { teacher_ids: picked, deadline: deadline ? endOfDay(deadline) : 0 });
        toast.show(`เปิดรอบแล้ว แจ้ง${teacher}ที่เลือก ${picked.length} คน`);
        await reload();
      } catch (e) { setErr(e instanceof Error ? e.message : 'เปิดรอบไม่สำเร็จ'); }
    };
    return (
      <>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <fieldset className="field" disabled={locked}>
          <legend>เลือก{teacher}ของภาคนี้</legend>
          {teachers.length === 0 && <EmptyState>ยังไม่มี{teacher}ในแผนก เชิญที่หน้า บุคลากรและห้อง</EmptyState>}
          {teachers.map((t) => (
            <label key={t.id}>
              <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))} /> {t.name}
            </label>
          ))}
        </fieldset>
        <TextField label="กำหนดส่ง" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <div className="actions"><Button variant="primary" onClick={() => void open()} disabled={locked}>เปิดรอบ</Button></div>
      </>
    );
  }

  const { round, board } = state;
  const pending = board.filter((b) => b.status === 'not_yet' || b.status === 'late');
  const complete = roundComplete(round);

  const columns: Column<BoardRow>[] = [
    { key: 'name', header: teacher, sortValue: (r) => nameOf(r.user_id), render: (r) => nameOf(r.user_id) },
    { key: 'status', header: 'สถานะ', sortValue: (r) => r.status, render: (r) => <Badge tone={RESPONSE_STATUS[r.status].tone}>{RESPONSE_STATUS[r.status].label}</Badge> },
    { key: 'at', header: 'เมื่อ', render: (r) => (r.at ? fmt(r.at) : r.reminded_at ? `เตือนแล้ว ${fmt(r.reminded_at)}` : '—') },
    {
      key: 'act', header: 'คำสั่ง',
      render: (r) => (r.status === 'not_yet' || r.status === 'late') && !locked && (
        <>
          <Button variant="tertiary" onClick={() => void remind(round.id, [r.user_id]).then(() => { toast.show(`เตือน ${nameOf(r.user_id)} แล้ว`); return reload(); }).catch(fail)}>เตือน</Button>
          <Button variant="tertiary" onClick={() => void fillForTeacher(round.id, r.user_id, user?.id ?? '', { any_time: true }).then(() => { toast.show(`บันทึกว่า ${nameOf(r.user_id)} ว่างทุกเวลา (หัวหน้าบันทึก)`); return reload(); }).catch(fail)}>บันทึกว่างทุกเวลา</Button>
        </>
      ),
    },
  ];

  return (
    <>
      <p>กำหนดส่ง <b>{fmt(round.deadline)}</b> · ตอบแล้ว {board.length - pending.length}/{board.length}</p>
      {board.some((b) => b.status === 'late') && <InlineAlert tone="warning">เลยกำหนดแล้วมีคนยังไม่ส่ง: เตือน กรอกแทน หรือบันทึกว่าว่างทุกเวลา</InlineAlert>}
      <DataTable columns={columns} rows={board} rowKey={(r) => r.user_id} caption="สถานะการส่งเวลาว่าง" rowProblem={(r) => (r.status === 'late' ? 'ล่าช้า' : null)} />
      {!locked && pending.length > 0 && (
        <div className="actions"><Button onClick={() => void remind(round.id).then((ids) => { toast.show(`เตือนแล้ว ${ids.length} คน`); return reload(); }).catch(fail)}>เตือนทุกคนที่ยังไม่ส่ง</Button></div>
      )}
      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" disabled={!complete} title={complete ? undefined : `ยังมี ${pending.length} คนที่ยังไม่มีคำตอบ`} onClick={() => void onComplete()}>เสร็จขั้นนี้</Button>
          {!complete && <span className="muted">ขั้นนี้เสร็จเมื่อทุกคนที่เลือกมีคำตอบ</span>}
        </div>
      )}
    </>
  );
}
