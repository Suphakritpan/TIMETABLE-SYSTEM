// 4.3 รายการของฉัน: blocker/warning ที่เกี่ยวกับอาจารย์คนนี้ + เธรดความเห็นเดียวกับที่หัวหน้าเห็น (อาจารย์ตอบได้ ตัดสินใจไม่ได้)
import { useEffect, useState } from 'react';
import { myIssues, type Issue } from '../api/issues';
import { listProfiles } from '../api/profiles';
import IssueThread from '../components/issues/IssueThread';
import { SEVERITY_VIEW } from '../profile/status';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';

export default function MyIssues() {
  const { user, departmentId } = useSession();
  const [issues, setIssues] = useState<Issue[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const profiles = departmentId ? await listProfiles(departmentId) : [];
      const list = await myIssues(user?.id ?? '', profiles.map((p) => p.id));
      if (live) setIssues(list);
    })();
    return () => { live = false; };
  }, [user?.id, departmentId]);

  const replace = (i: Issue) => setIssues((xs) => (xs ?? []).map((x) => (x.id === i.id ? i : x)));

  return (
    <>
      <PageHeader title="รายการของฉัน" subtitle="ปัญหาและเรื่องที่ต้องการให้คุณตรวจ" />
      {issues === null ? <Skeleton lines={4} label="กำลังโหลดรายการ" /> : issues.length === 0 ? (
        <EmptyState>ไม่มีรายการที่เกี่ยวกับคุณ</EmptyState>
      ) : issues.map((i) => (
        <section key={i.id} className="panel" aria-label={i.title}>
          <h2>{i.title} <Badge tone={SEVERITY_VIEW[i.severity].tone}>{SEVERITY_VIEW[i.severity].label}</Badge></h2>
          <p>{i.detail}</p>
          <IssueThread issue={i} onChange={replace} />
        </section>
      ))}
    </>
  );
}
