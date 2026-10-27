// 3.1–3.4 ผู้ดูแลสถาบัน: ภาพรวม · ปฏิทินการศึกษา · แผนกวิชา + หัวหน้า · ห้องร่วม (3.5 รูปแบบหลักสูตร และ 3.6 ระบบ อยู่ในแผนภายหลัง)
import { useCallback, useEffect, useState } from 'react';
import {
  adminAddDepartment, adminAddSharedRoom, adminAddTerm, adminDeleteDepartment, adminDeleteTerm, adminInviteHead, adminListDepartments,
  adminListSharedRooms, adminListTerms, adminOverview, adminRemoveHead, adminRemoveSharedRoom, adminResendHeadInvite, adminSetHolidays,
  type DepartmentRow, type OverviewRow, type SharedRoom,
} from '../api/admin';
import type { TermDetail } from '../api/terms';
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
import { useSession } from '../context/Session';
import { termLabel } from '../utils/buddhistEra';
import { term } from '../utils/terminology';

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const PROGRESS = { published: { tone: 'success', label: 'เผยแพร่แล้ว' }, in_progress: { tone: 'warning', label: 'กำลังทำ' }, not_started: { tone: 'neutral', label: 'ยังไม่เริ่ม' } } as const;

export default function Admin() {
  const { role, institutionType } = useSession();
  const dep = term(institutionType, 'department');
  const [tab, setTab] = useState('overview');
  return (
    <>
      <div className="toolbar"><h1>ผู้ดูแลสถาบัน</h1></div>
      <Tabs label="ส่วนของผู้ดูแล" value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'ภาพรวม' }, { key: 'calendar', label: 'ปฏิทินการศึกษา' },
        { key: 'departments', label: dep }, { key: 'rooms', label: 'ห้องร่วม' },
      ]}>
        {tab === 'overview' && <Overview role={role} depLabel={dep} />}
        {tab === 'calendar' && <Calendar role={role} />}
        {tab === 'departments' && <Departments role={role} depLabel={dep} />}
        {tab === 'rooms' && <SharedRooms role={role} />}
      </Tabs>
    </>
  );
}

type P = { role: ReturnType<typeof useSession>['role'] };

function Overview({ role, depLabel }: P & { depLabel: string }) {
  const [terms, setTerms] = useState<TermDetail[] | null>(null);
  const [termId, setTermId] = useState('');
  const [rows, setRows] = useState<OverviewRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void adminListTerms(role).then((t) => { if (!live) return; setTerms(t); setTermId((cur) => cur || t[0]?.id || ''); });
    return () => { live = false; };
  }, [role]);
  useEffect(() => {
    if (!termId) return;
    let live = true;
    void adminOverview(role, termId).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [role, termId]);

  if (!terms) return <Skeleton lines={4} label="กำลังโหลดภาพรวม" />;
  const columns: Column<OverviewRow>[] = [
    { key: 'name', header: depLabel, sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'head', header: 'หัวหน้า', render: (r) => (r.has_head ? <Badge tone="success">มีหัวหน้า</Badge> : <Badge tone="warning">ยังไม่มีหัวหน้า</Badge>) },
    { key: 'progress', header: 'สถานะภาคนี้', sortValue: (r) => r.progress, render: (r) => <Badge tone={PROGRESS[r.progress].tone}>{PROGRESS[r.progress].label}</Badge> },
    { key: 'profile', header: 'โปรไฟล์', render: (r) => r.profile_name ?? '—' },
  ];
  const late = rows?.filter((r) => r.progress !== 'published') ?? [];
  return (
    <>
      <SelectField label="ภาคเรียน" value={termId} onChange={(e) => { setRows(null); setTermId(e.target.value); }}>
        {terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
      </SelectField>
      {rows === null ? <Skeleton lines={3} label="กำลังโหลด" /> : (
        <>
          <p><b>{`เผยแพร่แล้ว ${rows.length - late.length} จาก ${rows.length} ${depLabel}`}</b></p>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.department_id} caption={`สถานะ${depLabel}ในภาคเรียน`} rowProblem={(r) => (!r.has_head ? 'ยังไม่มีหัวหน้า' : null)} />
        </>
      )}
    </>
  );
}

function Calendar({ role }: P) {
  const toast = useToast();
  const [terms, setTerms] = useState<TermDetail[] | null>(null);
  const [dlg, setDlg] = useState<'term' | 'holidays' | null>(null);
  const [target, setTarget] = useState<TermDetail | null>(null);
  const [del, setDel] = useState<TermDetail | null>(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ no: 1, year_be: new Date().getFullYear() + 543, start: '', end: '' });
  const [h, setH] = useState({ day: '', name: '' });

  const reload = useCallback(async () => setTerms(await adminListTerms(role)), [role]);
  useEffect(() => {
    let live = true;
    void adminListTerms(role).then((t) => { if (live) setTerms(t); });
    return () => { live = false; };
  }, [role]);

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });
  const addTerm = async () => {
    setErr('');
    try { await adminAddTerm(role, { no: f.no, year_ce: f.year_be - 543, start_date: f.start, end_date: f.end }); setDlg(null); toast.show('เพิ่มภาคเรียนแล้ว'); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); }
  };
  const addHoliday = async () => {
    if (!target) return;
    setErr('');
    try {
      const t = await adminSetHolidays(role, target.id, [...target.holidays, { day: h.day, name: h.name }]);
      setTarget(t);
      setH({ day: '', name: '' });
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); }
  };
  const removeHoliday = async (day: string) => {
    if (!target) return;
    try { const t = await adminSetHolidays(role, target.id, target.holidays.filter((x) => x.day !== day)); setTarget(t); await reload(); } catch (e) { fail(e); }
  };
  const confirmDelete = async () => {
    if (!del) return;
    const t = del;
    setDel(null);
    try { await adminDeleteTerm(role, t.id); toast.show(`ลบภาค ${termLabel(t)} แล้ว`); await reload(); } catch (e) { fail(e); }
  };

  const columns: Column<TermDetail>[] = [
    { key: 'label', header: 'ภาคเรียน', sortValue: (r) => r.start_date, render: (r) => termLabel(r) },
    { key: 'range', header: 'ช่วงวันที่', render: (r) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` },
    { key: 'hol', header: 'วันหยุด', align: 'right', render: (r) => r.holidays.length },
    { key: 'act', header: 'คำสั่ง', render: (r) => (<><Button variant="tertiary" onClick={() => { setTarget(r); setErr(''); setDlg('holidays'); }}>วันหยุด</Button><Button variant="tertiary" onClick={() => setDel(r)}>ลบ</Button></>) },
  ];

  return (
    <>
      <div className="toolbar"><span className="muted">ภาคเรียนของโปรไฟล์เลือกจากที่นี่ ไม่ใช้วันที่จากไฟล์หลักสูตร</span><span className="spacer" /><Button variant="primary" onClick={() => { setErr(''); setDlg('term'); }}>เพิ่มภาคเรียน</Button></div>
      {terms === null ? <Skeleton lines={3} label="กำลังโหลดปฏิทิน" /> : <DataTable columns={columns} rows={terms} rowKey={(r) => r.id} caption="ปฏิทินการศึกษา" empty="ยังไม่มีภาคเรียน" />}

      <Dialog open={dlg === 'term'} title="เพิ่มภาคเรียน" onClose={() => setDlg(null)} footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void addTerm()}>เพิ่ม</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <SelectField label="ภาคที่" value={f.no} onChange={(e) => setF({ ...f, no: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
        <TextField label="ปีการศึกษา (พ.ศ.)" type="number" value={f.year_be} onChange={(e) => setF({ ...f, year_be: Number(e.target.value) })} />
        <TextField label="วันเริ่ม" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <TextField label="วันสิ้นสุด" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </Dialog>

      <Dialog open={dlg === 'holidays' && target !== null} title={`วันหยุดของภาค ${target ? termLabel(target) : ''}`} onClose={() => setDlg(null)}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        {target && (target.holidays.length === 0 ? <p className="muted">ยังไม่มีวันหยุด</p> : (
          <ul>{target.holidays.map((x) => <li key={x.day}>{fmtDate(x.day)} · {x.name} <Button variant="tertiary" aria-label={`ลบวันหยุด ${x.name}`} onClick={() => void removeHoliday(x.day)}>ลบ</Button></li>)}</ul>
        ))}
        <TextField label="วันที่" type="date" value={h.day} onChange={(e) => setH({ ...h, day: e.target.value })} />
        <TextField label="ชื่อวันหยุด" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
        <Button onClick={() => void addHoliday()}>เพิ่มวันหยุด</Button>
      </Dialog>

      <ConfirmDialog open={del !== null} title="ลบภาคเรียน" confirmLabel="ลบภาคเรียน" destructive onCancel={() => setDel(null)} onConfirm={() => void confirmDelete()}>
        <p>ลบภาค {del ? termLabel(del) : ''} ออกจากปฏิทิน (ถ้ามีโปรไฟล์ใช้อยู่ ระบบจะไม่ให้ลบ)</p>
      </ConfirmDialog>
    </>
  );
}

function Departments({ role, depLabel }: P & { depLabel: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<DepartmentRow[] | null>(null);
  const [dlg, setDlg] = useState<'new' | 'head' | null>(null);
  const [target, setTarget] = useState<DepartmentRow | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const [del, setDel] = useState<DepartmentRow | null>(null);
  const [rmHead, setRmHead] = useState<DepartmentRow | null>(null);

  const reload = useCallback(async () => setRows(await adminListDepartments(role)), [role]);
  useEffect(() => {
    let live = true;
    void adminListDepartments(role).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [role]);

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });
  const abs = (hash: string) => `${window.location.origin}${window.location.pathname}${hash}`;
  const create = async () => { setErr(''); try { await adminAddDepartment(role, name); setDlg(null); setName(''); toast.show(`สร้าง${depLabel}แล้ว`); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); } };
  const invite = async () => {
    if (!target) return;
    setErr('');
    try { const { invite_url } = await adminInviteHead(role, target.id, email); setLink(abs(invite_url)); setDlg(null); setEmail(''); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); }
  };

  const columns: Column<DepartmentRow>[] = [
    { key: 'name', header: depLabel, sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'head', header: 'หัวหน้า', render: (r) => (r.head ? `${r.head.name} (${r.head.email})` : r.head_invited ? <Badge tone="warning">เชิญแล้ว: {r.head_invited}</Badge> : <Badge tone="error">ยังไม่มีหัวหน้า</Badge>) },
    { key: 'members', header: 'สมาชิก', align: 'right', render: (r) => r.members },
    {
      key: 'act', header: 'คำสั่ง',
      render: (r) => (
        <>
          {!r.head && !r.head_invited && <Button variant="tertiary" onClick={() => { setTarget(r); setErr(''); setDlg('head'); }}>เชิญหัวหน้า</Button>}
          {r.head_invited && <Button variant="tertiary" onClick={() => void adminResendHeadInvite(role, r.id).then(({ invite_url }) => setLink(abs(invite_url))).catch(fail)}>ส่งลิงก์ใหม่</Button>}
          {r.head && <Button variant="tertiary" onClick={() => setRmHead(r)}>ถอดหัวหน้า</Button>}
          <Button variant="tertiary" onClick={() => setDel(r)}>ลบ</Button>
        </>
      ),
    },
  ];

  return (
    <>
      <div className="toolbar"><span className="spacer" /><Button variant="primary" onClick={() => { setErr(''); setDlg('new'); }}>สร้าง{depLabel}</Button></div>
      {link && <InlineAlert tone="success">ลิงก์เชิญหัวหน้า (ยังไม่ได้ตั้งค่าอีเมล ให้คัดลอกส่งเอง): <code>{link}</code>{' '}<Button variant="tertiary" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.show('คัดลอกลิงก์แล้ว'))}>คัดลอก</Button></InlineAlert>}
      {rows === null ? <Skeleton lines={3} label="กำลังโหลด" /> : <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={`${depLabel}และหัวหน้า`} rowProblem={(r) => (!r.head && !r.head_invited ? 'ยังไม่มีหัวหน้า' : null)} empty={`ยังไม่มี${depLabel}`} />}

      <Dialog open={dlg === 'new'} title={`สร้าง${depLabel}`} onClose={() => setDlg(null)} footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void create()}>สร้าง</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <TextField label={`ชื่อ${depLabel}`} value={name} onChange={(e) => setName(e.target.value)} />
      </Dialog>
      <Dialog open={dlg === 'head'} title={`เชิญหัวหน้า ${target?.name ?? ''}`} onClose={() => setDlg(null)} footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void invite()}>สร้างลิงก์เชิญ</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <TextField label="อีเมลหัวหน้า" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Dialog>
      <ConfirmDialog open={del !== null} title={`ลบ${depLabel}`} confirmLabel={`ลบ${depLabel}`} destructive onCancel={() => setDel(null)} onConfirm={() => { const d = del; setDel(null); if (d) void adminDeleteDepartment(role, d.id).then(() => { toast.show(`ลบ ${d.name} แล้ว`); return reload(); }).catch(fail); }}>
        <p>ลบ {del?.name} (ถ้ามีบุคลากรหรือโปรไฟล์อยู่ ระบบจะไม่ให้ลบ)</p>
      </ConfirmDialog>
      <ConfirmDialog open={rmHead !== null} title="ถอดหัวหน้า" confirmLabel="ถอดหัวหน้า" destructive onCancel={() => setRmHead(null)} onConfirm={() => { const d = rmHead; setRmHead(null); if (d) void adminRemoveHead(role, d.id).then(() => { toast.show('ถอดหัวหน้าแล้ว'); return reload(); }).catch(fail); }}>
        <p>{rmHead?.head?.name} จะไม่เป็นหัวหน้าของ {rmHead?.name} อีก (บัญชีไม่ถูกลบ) {depLabel}จะไม่มีหัวหน้าจนกว่าจะเชิญคนใหม่</p>
      </ConfirmDialog>
    </>
  );
}

function SharedRooms({ role }: P) {
  const toast = useToast();
  const [rooms, setRooms] = useState<SharedRoom[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', type: 'ห้องประชุม', seats: 50 });
  const reload = useCallback(async () => setRooms(await adminListSharedRooms(role)), [role]);
  useEffect(() => {
    let live = true;
    void adminListSharedRooms(role).then((r) => { if (live) setRooms(r); });
    return () => { live = false; };
  }, [role]);

  const save = async () => { setErr(''); try { await adminAddSharedRoom(role, f); setOpen(false); setF({ name: '', type: 'ห้องประชุม', seats: 50 }); toast.show('เพิ่มห้องร่วมแล้ว'); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'ไม่สำเร็จ'); } };
  const columns: Column<SharedRoom>[] = [
    { key: 'name', header: 'ชื่อห้อง', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'type', header: 'ประเภท', render: (r) => r.type },
    { key: 'seats', header: 'ที่นั่ง', align: 'right', sortValue: (r) => r.seats, render: (r) => r.seats },
    { key: 'act', header: 'คำสั่ง', render: (r) => <Button variant="tertiary" onClick={() => void adminRemoveSharedRoom(role, r.id).then(reload)}>ลบ</Button> },
  ];
  return (
    <>
      <div className="toolbar"><span className="muted">ห้องที่หลายแผนกใช้ร่วมกัน การจองระหว่างแผนกจะทำตอนเผยแพร่</span><span className="spacer" /><Button variant="primary" onClick={() => { setErr(''); setOpen(true); }}>เพิ่มห้องร่วม</Button></div>
      {rooms === null ? <Skeleton lines={3} label="กำลังโหลดห้องร่วม" /> : <DataTable columns={columns} rows={rooms} rowKey={(r) => r.id} caption="ห้องร่วม" empty="ยังไม่มีห้องร่วม" />}
      <Dialog open={open} title="เพิ่มห้องร่วม" onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>ยกเลิก</Button><Button variant="primary" onClick={() => void save()}>เพิ่ม</Button></>}>
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        <TextField label="ชื่อห้อง" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label="ประเภท" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} />
        <TextField label="ที่นั่ง" type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} />
      </Dialog>
    </>
  );
}
