// 2.2 โปรไฟล์: รายการ + สร้างใหม่ + คัดลอกจากภาคก่อน
import { useEffect, useState } from 'react';
import { copyProfile, createProfile, listProfiles, listTerms } from '../api/profiles';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import DataTable, { type Column } from '../components/ui/DataTable';
import Dialog from '../components/ui/Dialog';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { PROFILE_STATUS } from '../profile/status';
import type { Profile, Term } from '../types';
import { termLabel } from '../utils/buddhistEra';

const PROGRAMS = ['ปวช.', 'ปวส.'];

export default function Profiles({ departmentId, onOpen }: { departmentId: string; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [dlg, setDlg] = useState<'new' | 'copy' | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', term: '', programs: PROGRAMS.slice(), source: '' });

  useEffect(() => {
    let live = true;
    void Promise.all([listProfiles(departmentId), listTerms()]).then(([r, t]) => {
      if (!live) return;
      setRows(r);
      setTerms(t);
    });
    return () => { live = false; };
  }, [departmentId]);

  const termOf = (id: string) => terms.find((t) => t.id === id);
  const open = (kind: 'new' | 'copy') => {
    setErr('');
    setForm({ name: '', term: terms[0]?.id ?? '', programs: PROGRAMS.slice(), source: rows?.[0]?.id ?? '' });
    setDlg(kind);
  };

  const submit = async () => {
    setErr('');
    try {
      const p = dlg === 'new'
        ? await createProfile(departmentId, { name: form.name, term_id: form.term, programs: form.programs })
        : await copyProfile(form.source, form.term);
      setDlg(null);
      toast.show(`สร้าง "${p.name}" แล้ว`);
      onOpen(p.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    }
  };

  const columns: Column<Profile>[] = [
    { key: 'name', header: 'ชื่อ', sortValue: (r) => r.name, render: (r) => <button type="button" className="th-btn link" onClick={() => onOpen(r.id)}>{r.name}</button> },
    { key: 'term', header: 'ภาคเรียน', sortValue: (r) => r.term_id, render: (r) => { const t = termOf(r.term_id); return t ? termLabel(t) : r.term_id; } },
    { key: 'years', header: 'หลักสูตร × ชั้นปี', render: (r) => `${r.year_plans.length} แท็บ` },
    { key: 'stale', header: 'ขั้นล้าสมัย', align: 'right', sortValue: (r) => r.year_plans.reduce((n, y) => n + y.steps.filter((s) => s === 'stale').length, 0), render: (r) => r.year_plans.reduce((n, y) => n + y.steps.filter((s) => s === 'stale').length, 0) },
    { key: 'status', header: 'สถานะ', render: (r) => <Badge tone={PROFILE_STATUS[r.status].tone}>{PROFILE_STATUS[r.status].label}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="โปรไฟล์"
        subtitle="ชุดตารางเรียนของแต่ละภาคเรียน"
        actions={<>
        <Button onClick={() => open('copy')} disabled={!rows?.length} title={rows?.length ? undefined : 'ยังไม่มีโปรไฟล์ให้คัดลอก'}>คัดลอกจากภาคก่อน</Button>
        <Button variant="primary" onClick={() => open('new')}>สร้างโปรไฟล์ใหม่</Button>
        </>}
      />

      {rows === null ? <Skeleton variant="table" lines={4} label="กำลังโหลดโปรไฟล์" /> : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="โปรไฟล์ตารางเรียน" empty="ยังไม่มีโปรไฟล์ เริ่มด้วย “สร้างโปรไฟล์ใหม่”" />
      )}

      <Dialog
        open={dlg !== null}
        title={dlg === 'new' ? 'สร้างโปรไฟล์ใหม่' : 'คัดลอกจากภาคก่อน'}
        onClose={() => setDlg(null)}
        footer={<><Button onClick={() => setDlg(null)}>ยกเลิก</Button><Button variant="primary" onClick={() => void submit()}>{dlg === 'new' ? 'สร้าง' : 'คัดลอก'}</Button></>}
      >
        {err && <InlineAlert tone="error">{err}</InlineAlert>}
        {dlg === 'new' ? (
          <>
            <TextField label="ชื่อโปรไฟล์" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <fieldset className="field">
              <legend>หลักสูตร</legend>
              {PROGRAMS.map((p) => (
                <label key={p}>
                  <input type="checkbox" checked={form.programs.includes(p)} onChange={(e) => setForm({ ...form, programs: e.target.checked ? [...form.programs, p] : form.programs.filter((x) => x !== p) })} /> {p}
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <SelectField label="คัดลอกจากโปรไฟล์" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {rows?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </SelectField>
        )}
        <SelectField label="ภาคเรียน" hint="เลือกจากปฏิทินการศึกษาของสถาบัน" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
          {terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
        </SelectField>
      </Dialog>
    </>
  );
}
