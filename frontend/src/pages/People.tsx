// 2.3 บุคลากร & ห้องของแผนก (อยู่นอกโปรไฟล์ พิมพ์ครั้งเดียวใช้ซ้ำได้ทุกภาค)
import { useEffect, useState } from 'react';
import { createResetLink } from '../api/account';
import { departmentName } from '../api/departments';
import { addRoom, createInvite, listPeople, listRooms, removePerson, removeRoom, resendInvite, updateRoom, type InviteRole, type Person, type Room } from '../api/people';
import SearchInput from '../components/ui/SearchInput';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import { MultiImagePick } from '../components/ui/ImagePick';
import Icon from '../components/ui/Icon';
import ProgressBar from '../components/ui/ProgressBar';
import StatCard from '../components/ui/StatCard';
import Dialog from '../components/ui/Dialog';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import Tabs from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { ROOM_TYPES } from '../data/rooms';
import { useSession } from '../context/Session';
import { term } from '../utils/terminology';

const NONE = 'ยังไม่ระบุ';
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
  const [view, setView] = useState<Person | null>(null);
  const [filter, setFilter] = useState('all');
  const [invite, setInvite] = useState<{ email: string; role: InviteRole }>({ email: '', role: 'TEACHER' });
  const blankRoom = { name: '', type: ROOM_TYPES[0], seats: 30, location: '', description: '', photos: [] as string[] };
  const [room, setRoom] = useState(blankRoom);
  const [roomView, setRoomView] = useState<Room | null>(null);
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
      setRoom(blankRoom);
      toast.show('เพิ่มห้องแล้ว');
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'เพิ่มห้องไม่สำเร็จ'); }
  };

  const saveRoomDetail = async () => {
    if (!roomView) return;
    try {
      await updateRoom(departmentId, roomView.id, roomView);
      setRoomView(null);
      toast.show('บันทึกข้อมูลห้องแล้ว');
      await refresh();
    } catch (e) { fail(e); }
  };

  const needle = q.trim().toLowerCase();
  const all = people ?? [];
  const shownPeople = all.filter((p) => (filter === 'all' || p.role === filter || (filter === 'invited' && p.status === 'invited')) && `${p.name} ${p.email}`.toLowerCase().includes(needle));
  const shownRooms = (rooms ?? []).filter((r) => `${r.name} ${r.type} ${r.location}`.toLowerCase().includes(needle));
  const roomTypes = [...new Set(shownRooms.map((r) => r.type))];
  const totalSeats = (rooms ?? []).reduce((n, r) => n + r.seats, 0);
  const filters: [string, string][] = [['all', 'ทั้งหมด'], ['TEACHER', teacher], ['ASSISTANT', 'ผู้ช่วย'], ['invited', 'รอตอบรับ']];

  const personCard = (r: Person) => (
    <li key={`${r.status}-${r.id}`} className="person-card">
      <button type="button" className="person-top person-open" aria-label={`ดูรายละเอียด ${r.name}`} onClick={() => setView(r)}>
        <Avatar name={r.name || r.email} src={r.avatar} />
        <span className="row-text">
          <strong>{r.name}</strong>
          <span className="muted">{r.email}</span>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      <div className="chips-row">
        <Badge tone="info">{r.role === 'TEACHER' ? teacher : ROLE[r.role]}</Badge>
        {r.status === 'joined' ? <Badge tone="success">เข้าร่วมแล้ว</Badge> : <Badge tone="warning">เชิญแล้ว รอตอบรับ</Badge>}
      </div>
      <div className="person-actions">
        {r.status === 'invited' && <Button variant="tertiary" onClick={() => void resend(r)}>ส่งลิงก์ใหม่</Button>}
        {r.status === 'joined' && r.role !== 'HEAD' && isHead && (
          <Button variant="tertiary" onClick={() => void resetLink(r)}>สร้างลิงก์รีเซ็ตรหัสผ่าน</Button>
        )}
        {r.role !== 'HEAD' && (
          <Button variant="tertiary" disabled={!isHead} title={isHead ? undefined : 'เฉพาะหัวหน้าเท่านั้นที่ลบได้'} onClick={() => setDel(r)}>
            {r.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบ'}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader
        title="บุคลากรและห้อง"
        subtitle="เชิญอาจารย์ ผู้ช่วย และจัดการห้องของแผนก"
        actions={<Button variant="primary" onClick={() => { setErr(''); setDlg(tab === 'people' ? 'invite' : 'room'); }}>{tab === 'people' ? `เชิญ${teacher}/ผู้ช่วย` : 'เพิ่มห้อง'}</Button>}
      />

      <div className="stat-row">
        <StatCard label={teacher} value={all.filter((p) => p.role === 'TEACHER' && p.status === 'joined').length} tone="info" />
        <StatCard label="ผู้ช่วย" value={all.filter((p) => p.role === 'ASSISTANT' && p.status === 'joined').length} tone="info" />
        <StatCard label="รอตอบรับ" value={all.filter((p) => p.status === 'invited').length} tone="warning" />
        <StatCard label="ห้องของแผนก" value={rooms?.length ?? 0} hint={`รวม ${totalSeats} ที่นั่ง`} tone="success" />
      </div>

      {link && (
        <InlineAlert tone="success">
          <b>{link.title}</b> (ยังไม่ได้ตั้งค่าอีเมล ให้คัดลอกลิงก์ส่งเอง):<br />
          <code>{link.url}</code>{' '}
          <Button variant="tertiary" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => toast.show('คัดลอกลิงก์แล้ว'))}>คัดลอก</Button>
        </InlineAlert>
      )}

      <Tabs label="ส่วนของหน้า" value={tab} onChange={(k) => { setTab(k); setQ(''); }} tabs={[{ key: 'people', label: 'บุคลากร' }, { key: 'rooms', label: 'ห้อง' }]}>
        <div className="list-toolbar">
          <SearchInput label={tab === 'people' ? 'ค้นหาชื่อหรืออีเมล' : 'ค้นหาชื่อ ประเภท หรือสถานที่'} value={q} onChange={setQ} />
          {tab === 'people' && (
            <div className="chips" role="group" aria-label="กรองตามบทบาท">
              {filters.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
          )}
        </div>
        {tab === 'people'
          ? people === null ? <Skeleton variant="table" lines={4} label="กำลังโหลดบุคลากร" />
            : shownPeople.length === 0 ? <EmptyState>{all.length === 0 ? 'ยังไม่มีบุคลากร เริ่มด้วยการเชิญ' : 'ไม่พบบุคลากรที่ตรงกับเงื่อนไข'}</EmptyState>
            : <ul className="person-grid" aria-label="บุคลากรของแผนก">{shownPeople.map(personCard)}</ul>
          : rooms === null ? <Skeleton variant="table" lines={3} label="กำลังโหลดห้อง" />
            : shownRooms.length === 0 ? <EmptyState>{rooms.length === 0 ? 'ยังไม่มีห้องของแผนก (ห้องร่วมมาจากผู้ดูแลสถาบัน)' : 'ไม่พบห้องที่ตรงกับเงื่อนไข'}</EmptyState>
            : roomTypes.map((t) => (
              <section key={t} className="room-group" aria-label={t}>
                <h2>{t} <span className="muted">({shownRooms.filter((r) => r.type === t).length})</span></h2>
                <ul className="person-grid">
                  {shownRooms.filter((r) => r.type === t).map((r) => (
                    <li key={r.id} className="person-card room-card">
                      <button type="button" className="room-open" aria-label={`ดูรายละเอียดห้อง ${r.name}`} onClick={() => setRoomView(r)}>
                        {r.photos?.[0] ? <img className="room-photo" src={r.photos[0]} alt="" /> : <span className="room-photo room-photo-ph" aria-hidden="true"><Icon name="layers" size={28} /></span>}
                        <strong>{r.name}</strong>
                        <span className="muted"><Icon name="pin" size={14} /> {r.location}</span>
                        <span className="muted">{r.seats} ที่นั่ง</span>
                        <ProgressBar value={r.seats} max={Math.max(...shownRooms.map((x) => x.seats))} label={`ความจุของ ${r.name}`} />
                      </button>
                      <div className="person-actions"><Button variant="tertiary" onClick={() => void removeRoom(departmentId, r.id).then(refresh)}>ลบ</Button></div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
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
        <TextField label="สถานที่" value={room.location} placeholder="เช่น อาคาร 6 ชั้น 2" onChange={(e) => setRoom({ ...room, location: e.target.value })} />
        <TextAreaField label="คำอธิบายห้อง (ไม่บังคับ)" placeholder="เช่น ลักษณะห้อง เหมาะกับวิชาแบบไหน ข้อควรรู้ในการใช้ห้อง" value={room.description} onChange={(e) => setRoom({ ...room, description: e.target.value })} />
        <TextField label="ที่นั่ง" type="number" min={1} value={room.seats} onChange={(e) => setRoom({ ...room, seats: Number(e.target.value) })} />
        <MultiImagePick label="รูปห้อง" value={room.photos} onChange={(photos) => setRoom({ ...room, photos })} />
      </Dialog>

      <Dialog open={view !== null} title="รายละเอียดบุคลากร" onClose={() => setView(null)} footer={<Button onClick={() => setView(null)}>ปิด</Button>}>
        {view && (
          <div className="person-detail">
            {view.avatar ? <img className="person-photo" src={view.avatar} alt={`รูปของ ${view.name}`} /> : <div className="person-photo person-photo-ph"><Avatar name={view.name || view.email} /></div>}
            <h3>{view.name}</h3>
            <dl>
              <dt>อีเมล</dt><dd><a href={`mailto:${view.email}`}>{view.email}</a></dd>
              <dt>แผนก</dt><dd>{departmentName(departmentId)}</dd>
              <dt>บทบาท</dt><dd>{view.role === 'TEACHER' ? teacher : ROLE[view.role]}</dd>
              <dt>สถานะ</dt><dd>{view.status === 'joined' ? 'เข้าร่วมแล้ว' : 'เชิญแล้ว รอตอบรับ'}</dd>
              <dt>ตำแหน่ง</dt><dd>{view.position || NONE}</dd>
              <dt>โทรศัพท์</dt><dd>{view.phone ? <a href={`tel:${view.phone}`}>{view.phone}</a> : NONE}</dd>
              <dt>LINE ID</dt><dd>{view.line_id || NONE}</dd>
              <dt>ห้องทำงาน</dt><dd>{view.office || NONE}</dd>
              {view.username && <><dt>ชื่อผู้ใช้</dt><dd>{view.username}</dd></>}
            </dl>
          </div>
        )}
      </Dialog>

      <Dialog open={roomView !== null} title="รายละเอียดห้อง" onClose={() => setRoomView(null)} footer={<><Button onClick={() => setRoomView(null)}>ปิด</Button><Button variant="primary" onClick={() => void saveRoomDetail()}>บันทึก</Button></>}>
        {roomView && (
          <div className="person-detail">
            {roomView.photos?.[0] ? <img className="room-hero" src={roomView.photos[0]} alt={`รูปห้อง ${roomView.name}`} /> : <div className="room-hero room-photo-ph"><Icon name="layers" size={48} /></div>}
            <h3>{roomView.name}</h3>
            <TextField label="ชื่อห้อง" value={roomView.name} onChange={(e) => setRoomView({ ...roomView, name: e.target.value })} />
            <SelectField label="ประเภท" value={roomView.type} onChange={(e) => setRoomView({ ...roomView, type: e.target.value })}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectField>
            <TextField label="จำนวนที่นั่ง" type="number" min={1} value={roomView.seats} onChange={(e) => setRoomView({ ...roomView, seats: Number(e.target.value) })} />
            <TextField label="สถานที่" value={roomView.location} onChange={(e) => setRoomView({ ...roomView, location: e.target.value })} />
            <TextAreaField label="คำอธิบายห้อง (ไม่บังคับ)" value={roomView.description ?? ''} onChange={(e) => setRoomView({ ...roomView, description: e.target.value })} />
            <TextField label="อุปกรณ์ในห้อง (ไม่บังคับ)" placeholder="เช่น โปรเจกเตอร์, แอร์, คอมพิวเตอร์ 30 เครื่อง" value={roomView.equipment ?? ''} onChange={(e) => setRoomView({ ...roomView, equipment: e.target.value })} />
            <TextField label="หมายเหตุ (ไม่บังคับ)" value={roomView.note ?? ''} onChange={(e) => setRoomView({ ...roomView, note: e.target.value })} />
            <MultiImagePick label="รูปห้อง" value={roomView.photos ?? []} onChange={(photos) => setRoomView({ ...roomView, photos })} />
          </div>
        )}
      </Dialog>

      <ConfirmDialog open={del !== null} title={del?.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบออกจากแผนก'} confirmLabel={del?.status === 'invited' ? 'ยกเลิกคำเชิญ' : 'ลบออกจากแผนก'} destructive onCancel={() => setDel(null)} onConfirm={() => void confirmRemove()}>
        <p>{del?.status === 'invited' ? `ลิงก์เชิญของ ${del.email} จะใช้ไม่ได้อีก` : `${del?.name} จะไม่เห็นข้อมูลของแผนกนี้อีก (บัญชีและข้อมูลในแผนกอื่นไม่ถูกลบ)`}</p>
      </ConfirmDialog>
    </>
  );
}
