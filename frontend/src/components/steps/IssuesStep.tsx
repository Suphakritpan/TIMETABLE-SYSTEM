// ขั้น 4: ข้อมูลอาจารย์ — รายการ BLOCKER/WARNING + เธรดความเห็น + การตัดสินใจ (flows F6) ไปต่อได้เมื่อไม่มีรายการค้าง
import { SEVERITY_VIEW } from '../../profile/status';
import { useEffect, useState } from 'react';
import { OUTCOMES, OUTCOME_LABEL, assertIssuesComplete, decide, listIssues, type Issue, type Outcome } from '../../api/issues';
import { listPeople, type Person } from '../../api/people';
import { useSession } from '../../context/Session';
import IssueThread from '../issues/IssueThread';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable, { type Column } from '../ui/DataTable';
import InlineAlert from '../ui/InlineAlert';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import type { StepProps } from './types';

export default function IssuesStep({ profile, done, locked, onComplete }: StepProps) {
  const toast = useToast();
  const { user } = useSession();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void Promise.all([listIssues(profile.id), listPeople(profile.department_id)]).then(([i, p]) => {
      if (!live) return;
      setIssues(i);
      setPeople(p);
      setSel((cur) => cur ?? i.find((x) => x.state === 'open')?.id ?? i[0]?.id ?? null);
    });
    return () => { live = false; };
  }, [profile.id, profile.department_id]);

  if (!issues) return <Skeleton lines={4} label="กำลังโหลดรายการ" />;

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? (id === user?.id ? user.name : id) : '—');
  const open = issues.filter((i) => i.state === 'open');
  const current = issues.find((i) => i.id === sel) ?? null;
  const replace = (i: Issue) => setIssues((xs) => (xs ?? []).map((x) => (x.id === i.id ? i : x)));

  const submitDecision = async () => {
    if (!current || !outcome || !user) return;
    setError('');
    try {
      replace(await decide(current.id, user.id, { outcome, note }));
      setOutcome('');
      setNote('');
      toast.show('บันทึกการตัดสินใจแล้ว');
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
  };
  const next = async () => {
    try { await assertIssuesComplete(profile.id); await onComplete(); } catch (e) { toast.show(e instanceof Error ? e.message : 'ไปต่อไม่ได้', { tone: 'error' }); }
  };

  const columns: Column<Issue>[] = [
    { key: 'sev', header: 'ระดับ', sortValue: (r) => r.severity, render: (r) => <Badge tone={SEVERITY_VIEW[r.severity].tone}>{SEVERITY_VIEW[r.severity].label}</Badge> },
    { key: 'title', header: 'รายการ', sortValue: (r) => r.title, render: (r) => r.title },
    { key: 'about', header: 'เกี่ยวกับ', render: (r) => nameOf(r.about_user_id) },
    { key: 'state', header: 'สถานะ', sortValue: (r) => r.state, render: (r) => (r.state === 'open' ? <Badge tone="warning">ค้าง</Badge> : <Badge tone="success">ปิดแล้ว</Badge>) },
  ];

  return (
    <>
      <p><b>{`ค้าง ${open.length} จาก ${issues.length} รายการ`}</b> · BLOCKER ต้องแก้ ส่วน WARNING ยอมรับพร้อมหมายเหตุได้</p>
      <DataTable columns={columns} rows={issues} rowKey={(r) => r.id} caption="รายการปัญหาจากข้อมูลอาจารย์" selectedKey={sel} onRowClick={(r) => { setSel(r.id); setOutcome(''); setNote(''); setError(''); }} rowProblem={(r) => (r.state === 'open' && r.severity === 'BLOCKER' ? 'BLOCKER ค้าง' : null)} />

      {current && (
        <section className="panel" aria-label={`รายละเอียด ${current.title}`}>
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
          <IssueThread issue={current} onChange={replace} nameOf={nameOf} />
          {current.state === 'open' && !locked && (
            <fieldset className="field">
              <legend>ตัดสินใจ</legend>
              {error && <InlineAlert tone="error">{error}</InlineAlert>}
              <label>วิธีจัดการ
                <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
                  <option value="">เลือก…</option>
                  {OUTCOMES[current.severity].map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                </select>
              </label>
              <label>หมายเหตุ (ทำไม)
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button variant="primary" disabled={!outcome} onClick={() => void submitDecision()}>บันทึกการตัดสินใจ</Button>
            </fieldset>
          )}
        </section>
      )}

      {!done && !locked && (
        <div className="actions">
          <Button variant="primary" disabled={open.length > 0} title={open.length ? `ยังมี ${open.length} รายการที่ยังไม่ตัดสินใจ` : undefined} onClick={() => void next()}>เสร็จขั้นนี้</Button>
          {open.length > 0 && <span className="muted">ต้องตัดสินใจให้ครบทุกรายการก่อน</span>}
        </div>
      )}
    </>
  );
}
