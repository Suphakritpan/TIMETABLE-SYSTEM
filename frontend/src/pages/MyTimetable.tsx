// 4.4 ตารางของฉัน: เฉพาะคาบของตัวเอง · ป้าย DRAFT (ตรวจทาน) หรือเผยแพร่แล้ว · ขอเปลี่ยน → 4.5 (N2: ห้ามเห็นข้อมูลอาจารย์คนอื่น)
import { useEffect, useState } from 'react';
import { listProfiles } from '../api/profiles';
import { createRequest, isMine } from '../api/review';
import { loadLastRun } from '../api/runs';
import TimetableGrid from '../components/timetable/TimetableGrid';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { DAYS, PERIODS } from '../data/sample';
import { useSession } from '../context/Session';
import type { ClassItem, Profile } from '../types';

export default function MyTimetable() {
  const toast = useToast();
  const { user, departmentId } = useSession();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (departmentId ? listProfiles(departmentId) : Promise.resolve([])).then((ps) => {
      if (!live) return;
      // เห็นเฉพาะโปรไฟล์ที่ส่งตรวจทานหรือเผยแพร่แล้ว (ร่างยังไม่เปิดให้ครู)
      setProfile(ps.find((p) => p.status === 'published') ?? ps.find((p) => p.status === 'review') ?? null);
    });
    return () => { live = false; };
  }, [departmentId]);

  if (profile === undefined) return <><div className="toolbar"><h1>ตารางของฉัน</h1></div><Skeleton lines={4} label="กำลังโหลด" /></>;
  if (profile === null || !user) return <><div className="toolbar"><h1>ตารางของฉัน</h1></div><EmptyState>ยังไม่มีตารางที่เปิดให้ดู หัวหน้ายังไม่ได้ส่งเข้าตรวจทาน</EmptyState></>;

  const mine: ClassItem[] = (loadLastRun(profile.id)?.placed ?? []).filter((c) => isMine(user, c));
  const sel = mine.find((c) => c.id === selected);
  const published = profile.status === 'published';

  const submit = async () => {
    if (!sel) return;
    setError('');
    try {
      await createRequest(profile.id, user, { class_id: sel.id, reason });
      toast.show('ส่งคำขอเปลี่ยนแล้ว ดูสถานะที่ "คำขอของฉัน"');
      setReason('');
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งคำขอไม่สำเร็จ'); }
  };

  return (
    <>
      <div className="toolbar">
        <h1>ตารางของฉัน</h1>
        <Badge tone={published ? 'success' : 'warning'}>{published ? 'เผยแพร่แล้ว' : 'DRAFT (กำลังตรวจทาน)'}</Badge>
        <span className="muted">{profile.name}</span>
      </div>
      {mine.length === 0 ? <EmptyState>ไม่มีคาบของคุณในตารางนี้</EmptyState> : (
        <div className="tt-wrap"><TimetableGrid days={DAYS} periods={PERIODS} items={mine} selectedId={selected} onSelect={setSelected} /></div>
      )}
      {sel && (
        <section className="panel" aria-label="ขอเปลี่ยนคาบ">
          <h2>{sel.code} {sel.name}</h2>
          <p>{DAYS[sel.day]} คาบ {sel.start}–{sel.start + sel.span - 1} · {sel.room}</p>
          {published && <InlineAlert tone="info">เผยแพร่แล้ว ขอเปลี่ยนไม่ได้โดยตรง ให้แจ้งหัวหน้าเพื่อเริ่มการเปลี่ยนแปลง</InlineAlert>}
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <label className="field">เหตุผลที่ขอเปลี่ยน
            <textarea className="input" rows={2} value={reason} disabled={published} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button variant="primary" disabled={published} onClick={() => void submit()}>ขอเปลี่ยน</Button>
        </section>
      )}
    </>
  );
}
