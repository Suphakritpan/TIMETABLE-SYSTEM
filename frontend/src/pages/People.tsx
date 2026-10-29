// 2.3 บุคลากร & ห้องของแผนก (อยู่นอกโปรไฟล์ พิมพ์ครั้งเดียวใช้ซ้ำได้ทุกภาค)
import { useEffect, useState } from 'react';
import { createResetLink } from '../api/account';
import { addRoom, createInvite, listPeople, listRooms, removePerson, removeRoom, resendInvite, type InviteRole, type Person, type Room } from '../api/people';
import SearchInput from '../components/ui/SearchInput';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DataTable, { type Column } from '../components/ui/DataTable';
import Dialog from '../components/ui/Dialog';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import Tabs from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { ROOM_TYPES } from '../data/rooms';
import { useSession } from '../context/Session';
import { term } from '../utils/terminology';

const ROLE = { HEAD: 'หัวหน้า', ASSISTANT: 'ผู้ช่วย', TEACHER: 'อาจารย์', ADMIN: 'ผู้ดูแล' } as const;

export default function People({ departmentId }: { departmentId: string }) {
  const toast = useToast();
  const { role, institutionType, user } = useSession();
  const [tab, setTab] = useState('people');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [dlg, setDlg] = useState<'invite' | 'room' | null>(null);
  const [link, setLink] = useState<{ title: string; url: string } | null>(null);
  const [del, setDel] = useState<Person | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [invite, setInvite] = useState<{ email: string; role: InviteRole }>({ email: '', role: 'TEACHER' });
  const [room, setRoom] = useState({ name: '', type: ROOM_TYPES[0], seats: 30 });
  const isHead = role === 'HEAD';
  const teacher = term(institutionType, 'teacher');

  const refresh = async () => {
    const [p, r] = await Promise.all([listPeople(departmentId), listRooms(departmentId)]);
    setPeople(p);
    setRooms(r);
  };
  useEffect(() => {
    let live = true;
    void Promise.all([listPeople(departmentId), listRooms(departmentId)]).then(([p, r]) => {
      if (!live) return;
      setPeople(p);
      setRooms(r);
    });
    return () => { live = false; };
  }, [departmentId]);

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });
  const absUrl = (hash: string) => `${window.location.origin}${window.location.pathname}${hash}`;

  const sendInvite = async () => {
    setErr('');
    try {
      const { invite_url } = await createInvite(departmentId, invite, role ?? 'TEACHER');
      setDlg(null);
      setLink({ title: `ลิงก์เชิญ ${invite.email}`, url: absUrl(invite_url) });
      setInvite({ email: '', role: 'TEACHER' });
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'เชิญไม่สำเร็จ'); }
  };
  // ลิงก์รีเซ็ต = ยึดบัญชีได้ทั้งบัญชี: API ปฏิเสธถ้าเป็นผู้ดูแล/หัวหน้าแผนกอื่น (D12) ให้ขอผู้ดูแลสถาบัน
  const resetLink = async (p: Person) => {
    try {
      const { reset_url } = await createResetLink({ id: user?.id ?? '', role, departmentId }, p.id);
      setLink({ title: `ลิงก์รีเซ็ตรหัสผ่านของ ${p.name} (ใช้ได้ครั้งเดียว 24 ชม.)`, url: absUrl(reset_url) });
    } catch (e) { fail(e); }
  };
  const resend = async (p: Person) => {
    try {
      const { invite_url } = await resendInvite(departmentId, p.invite_id ?? p.id);
      setLink({ title: `ลิงก์เชิญใหม่ของ ${p.email}`, url: absUrl(invite_url) });
    } catch (e) { fail(e); }
  };
  const confirmRemove = async () => {
    if (!del) return;
    const p = del;
    setDel(null);
    try {
      await removePerson(departmentId, p, role ?? 'TEACHER');
      toast.show(p.status === 'invited' ? `ยกเลิกคำเชิญ ${p.email} แล้ว` : `ลบ ${p.name} ออกจากแผนกแล้ว`);
      await refresh();
    } catch (e) { fail(e); }
  };
  const saveRoom = async () => {
    setErr('');
    try {
      await addRoom(departmentId, room);
      setDlg(null);
      setRoom({ name: '', type: ROOM_TYPES[0], seats: 30 });
      toast.show('เพิ่มห้องแล้ว');
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'เพิ่มห้องไม่สำเร็จ'); }
  };

  const needle = q.trim().toLowerCase();
  const shownPeople = (people ?? []).filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(needle));
  const peopleCols: Column<Person>[] = [
    { key: 'name', header: 'ชื่อ', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'email', header: 'อีเมล', sortValue: (r) => r.email, render: (r) => r.email },
    { key: 'role', header: 'บทบาท', sortValue: (r) => r.role, render: (r) => (r.role === 'TEACHER' ? teacher : ROLE[r.role]) },
    { key: 'status', header: 'สถานะ', render: (r) => (r.status === 'joined' ? <Badge tone="success">เข้าร่วมแล้ว</Badge> : <Badge tone="warning">เชิญแล้ว รอตอบรับ</Badge>) },
    {
      key: 'act', header: 'คำสั่ง',
      render: (r) => (
        <>
          {r.status === 'invited' && <Button variant="tertiary" onClick={() => void resend(r)}>ส่งลิงก์ใหม่</Button>}
          {r.status === 'joined' && r.role !== 'HEAD' && isHead && (
            <Button variant="tertiary" onClick={() => void resetLink(r)}>สร้างลิงก์รีเซ็ตรหัสผ่าน</Button>
          )}
          {r.role !== 'HEAD' && (
            <Button variant="tertiary" disabled={!isHead} title={isHead ? undefined : 'เฉพาะหัวหน้าเท่านั้นที่ลบได้'} onClick={() => setDel(r)}>
              {r.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบ'}
            </Button>
          )}
        </>
      ),
    },
  ];
  const roomCols: Column<Room>[] = [
    { key: 'name', header: 'ชื่อห้อง', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'type', header: 'ประเภท', sortValue: (r) => r.type, render: (r) => r.type },
    { key: 'seats', header: 'ที่นั่ง', align: 'right', sortValue: (r) => r.seats, render: (r) => r.seats },
    { key: 'act', header: 'คำสั่ง', render: (r) => <Button variant="tertiary" onClick={() => void removeRoom(departmentId, r.id).then(refresh)}>ลบ</Button> },
  ];

  return (
    <>
      <PageHeader
        title="บุคลากรและห้อง"
        subtitle="เชิญอาจารย์ ผู้ช่วย และจัดการห้องของแผนก"
        actions={<Button variant="primary" onClick={() => { setErr(''); setDlg(tab === 'people' ? 'invite' : 'room'); }}>{tab === 'people' ? `เชิญ${teacher}/ผู้ช่วย` : 'เพิ่มห้อง'}</Button>}
      />

      {link && (
        <InlineAlert tone="success">
          <b>{link.title}</b> (ยังไม่ได้ตั้งค่าอีเมล ให้คัดลอกลิงก์ส่งเอง):<br />
          <code>{link.url}</code>{' '}
          <Button variant="tertiary" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => toast.show('คัดลอกลิงก์แล้ว'))}>คัดลอก</Button>
        </InlineAlert>
      )}

      {tab === 'people' && <SearchInput label="ค้นหาชื่อหรืออีเมล" value={q} onChange={setQ} />}
      <Tabs label="ส่วนของหน้า" value={tab} onChange={setTab} tabs={[{ key: 'people', label: 'บุคลากร' }, { key: 'rooms', label: 'ห้อง' }]}>
        {tab === 'people'
          ? people === null ? <Skeleton variant="table" lines={4} label="กำลังโหลดบุคลากร" /> : <DataTable columns={peopleCols} rows={shownPeople} rowKey={(r) => `${r.status}-${r.id}`} caption="บุคลากรของแผนก" empty="ยังไม่มีบุคลากร เริ่มด้วยการเชิญ" />
          : rooms === null ? <Skeleton variant="table" lines={3} label="กำลังโหลดห้อง" /> : <DataTable columns={roomCols} rows={rooms} rowKey={(r) => r.id} caption="ห้องของแผนก" empty="ยังไม่มีห้องของแผนก (ห้องร่วมมาจากผู้ดูแลสถาบัน)" />}
      </Tabs>

      <Dialog open={dlg === 'invite'} title="เชิญบุคลากร" onClose={() => setDlg(null)} footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void sendInvite()}>สร้างลิงก์เชิญ</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <TextField label="อีเมล" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
        <SelectField label="บทบาท" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as InviteRole })} hint={isHead ? undefined : 'ผู้ช่วยเชิญได้เฉพาะ' + teacher}>
          <option value="TEACHER">{teacher}</option>
          <option value="ASSISTANT" disabled={!isHead}>ผู้ช่วย{isHead ? '' : ' (เฉพาะหัวหน้า)'}</option>
        </SelectField>
      </Dialog>

      <Dialog open={dlg === 'room'} title="เพิ่มห้อง" onClose={() => setDlg(null)} footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void saveRoom()}>เพิ่ม</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <TextField label="ชื่อห้อง" value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
        <SelectField label="ประเภท" value={room.type} onChange={(e) => setRoom({ ...room, type: e.target.value })}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectField>
        <TextField label="ที่นั่ง" type="number" min={1} value={room.seats} onChange={(e) => setRoom({ ...room, seats: Number(e.target.value) })} />
      </Dialog>

      <ConfirmDialog open={del !== null} title={del?.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบออกจากแผนก'} confirmLabel={del?.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบออกจากแผนก'} destructive onCancel={() => setDel(null)} onConfirm={() => void confirmRemove()}>
        <p>{del?.status === 'invited' ? `ลิงก์เชิญของ ${del.email} จะใช้ไม่ได้อีก` : `${del?.name} จะไม่เห็นข้อมูลของแผนกนี้อีก (บัญชีและข้อมูลในแผนกอื่นไม่ถูกลบ)`}</p>
      </ConfirmDialog>
    </>
  );
}
