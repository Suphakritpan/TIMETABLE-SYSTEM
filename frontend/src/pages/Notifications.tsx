// 1.1 การแจ้งเตือน: ในแอปเสมอ (อีเมลเมื่อตั้ง SMTP ใน 3.6 ภายหลัง) — ใหม่สุดก่อน อ่านทีละรายการหรือทั้งหมด
import { useEffect, useState } from 'react';
import { listNotifications, markRead, type Notification } from '../api/notifications';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';

const fmt = (ms: number) => new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export default function Notifications({ onChanged }: { onChanged: () => void }) {
  const { user } = useSession();
  const uid = user?.id ?? '';
  const [items, setItems] = useState<Notification[] | null>(null);
  useEffect(() => {
    let live = true;
    void listNotifications(uid).then((n) => { if (live) setItems(n); });
    return () => { live = false; };
  }, [uid]);

  const read = async (id?: string) => {
    await markRead(uid, id);
    setItems((xs) => (xs ?? []).map((n) => (!id || n.id === id ? { ...n, read: true } : n)));
    onChanged();
  };
  const unread = (items ?? []).filter((n) => !n.read).length;

  return (
    <>
      <div className="toolbar">
        <h1>การแจ้งเตือน</h1>
        <span className="spacer" />
        <Button onClick={() => void read()} disabled={unread === 0}>อ่านทั้งหมดแล้ว</Button>
      </div>
      {items === null ? <Skeleton lines={4} label="กำลังโหลดการแจ้งเตือน" /> : items.length === 0 ? <EmptyState>ยังไม่มีการแจ้งเตือน</EmptyState> : (
        <ul className="notes">
          {items.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              {!n.read && <Badge tone="info">ใหม่</Badge>} {n.body}
              <br /><small className="muted">{fmt(n.at)}</small>
              {!n.read && <> <Button variant="tertiary" onClick={() => void read(n.id)}>อ่านแล้ว</Button></>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
