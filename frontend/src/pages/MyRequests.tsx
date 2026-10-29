// 4.5 คำขอของฉัน: รอ / อนุมัติ / ปฏิเสธ + หมายเหตุ · และการเปลี่ยนที่หัวหน้าทำให้ฉัน ("แก้โดย <หัวหน้า>: …")
import { REQUEST_STATUS } from '../profile/status';
import { useEffect, useState } from 'react';
import { listNotifications, myRequests, type ChangeRequest, type Notification } from '../api/review';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import DataTable, { type Column } from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';

export default function MyRequests() {
  const { user } = useSession();
  const [reqs, setReqs] = useState<ChangeRequest[] | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);

  useEffect(() => {
    let live = true;
    void Promise.all([myRequests(user?.id ?? ''), listNotifications(user?.id ?? '')]).then(([r, n]) => {
      if (!live) return;
      setReqs(r);
      setNotes(n);
    });
    return () => { live = false; };
  }, [user?.id]);

  const columns: Column<ChangeRequest>[] = [
    { key: 'reason', header: 'เหตุผลที่ขอ', render: (r) => r.reason },
    { key: 'impact', header: 'ผลกระทบ', render: (r) => r.impact },
    { key: 'st', header: 'สถานะ', sortValue: (r) => r.status, render: (r) => <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge> },
    { key: 'note', header: 'หมายเหตุจากหัวหน้า', render: (r) => r.decision_note || '—' },
  ];

  return (
    <>
      <PageHeader title="คำขอของฉัน" subtitle="คำขอเปลี่ยนคาบที่คุณส่งและสถานะ" />
      {reqs === null ? <Skeleton variant="table" lines={3} label="กำลังโหลด" /> : <DataTable columns={columns} rows={reqs} rowKey={(r) => r.id} caption="คำขอเปลี่ยนของฉัน" empty="ยังไม่มีคำขอ" />}
      <section className="panel" aria-label="การเปลี่ยนแปลงถึงฉัน">
        <h2>การเปลี่ยนแปลงที่เกี่ยวกับฉัน</h2>
        {notes.length === 0 ? <EmptyState>ยังไม่มีการเปลี่ยนแปลง</EmptyState> : <ul>{notes.map((n) => <li key={n.id}>{n.body}</li>)}</ul>}
      </section>
    </>
  );
}
