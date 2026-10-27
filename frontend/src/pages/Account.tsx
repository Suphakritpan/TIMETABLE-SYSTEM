// 1.2 บัญชีของฉัน: ชื่อ ภาษา อีเมล รหัสผ่าน + สังกัดของฉัน (อ่านอย่างเดียว) — ชั่วโมงสอนสูงสุดต่อวันอยู่ที่ 4.2 เพราะเป็นค่าต่อภาคเรียน (D12)
import { useState, type FormEvent } from 'react';
import { changePassword, updateEmail, updateMe } from '../api/account';
import { MIN_PASSWORD } from '../api/institution';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import { useToast } from '../components/ui/Toast';
import { useSession } from '../context/Session';

const ROLE = { HEAD: 'หัวหน้า', ASSISTANT: 'ผู้ช่วย', TEACHER: 'ครู/อาจารย์' } as const;

export default function Account({ onSignOut }: { onSignOut: () => void }) {
  const toast = useToast();
  const { user, refreshUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [language, setLanguage] = useState<'th' | 'en'>(user?.language ?? 'th');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPw, setEmailPw] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ profile?: string; email?: string; password?: string }>({});
  if (!user) return null;

  const run = async (key: 'profile' | 'email' | 'password', fn: () => Promise<void>, ok: string) => {
    setErrors((e) => ({ ...e, [key]: undefined }));
    try { await fn(); toast.show(ok); } catch (e) { setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : 'ไม่สำเร็จ' })); }
  };
  const saveProfile = (e: FormEvent) => { e.preventDefault(); void run('profile', async () => refreshUser(await updateMe(user.id, { name, language })), 'บันทึกข้อมูลแล้ว'); };
  const saveEmail = (e: FormEvent) => { e.preventDefault(); void run('email', async () => { refreshUser(await updateEmail(user.id, email, emailPw)); setEmailPw(''); }, 'เปลี่ยนอีเมลแล้ว'); };
  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) { setErrors((x) => ({ ...x, password: 'รหัสผ่านใหม่ไม่ตรงกัน' })); return; }
    void run('password', async () => { await changePassword(user.id, cur, next); setCur(''); setNext(''); setAgain(''); }, 'เปลี่ยนรหัสผ่านแล้ว');
  };

  return (
    <>
      <div className="toolbar"><h1>บัญชีของฉัน</h1></div>
      <div className="form-col">
        <form onSubmit={saveProfile} aria-label="ข้อมูลส่วนตัว">
          <h2>ข้อมูลส่วนตัว</h2>
          {errors.profile && <InlineAlert tone="error">{errors.profile}</InlineAlert>}
          <TextField label="ชื่อ" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField label="ภาษา" value={language} onChange={(e) => setLanguage(e.target.value as 'th' | 'en')}><option value="th">ไทย</option><option value="en">English</option></SelectField>
          <Button variant="primary" type="submit">บันทึก</Button>
        </form>
        <hr />
        <form onSubmit={saveEmail} aria-label="อีเมล">
          <h2>อีเมล</h2>
          {errors.email && <InlineAlert tone="error">{errors.email}</InlineAlert>}
          <TextField label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="รหัสผ่านปัจจุบัน (ยืนยันการเปลี่ยนอีเมล)" type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
          <Button type="submit">เปลี่ยนอีเมล</Button>
        </form>
        <hr />
        <form onSubmit={savePassword} aria-label="เปลี่ยนรหัสผ่าน">
          <h2>เปลี่ยนรหัสผ่าน</h2>
          {errors.password && <InlineAlert tone="error">{errors.password}</InlineAlert>}
          <TextField label="รหัสผ่านปัจจุบัน" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <TextField label="รหัสผ่านใหม่" type="password" autoComplete="new-password" hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} value={next} onChange={(e) => setNext(e.target.value)} />
          <TextField label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          <Button type="submit">เปลี่ยนรหัสผ่าน</Button>
        </form>
        <hr />
        <section aria-label="สังกัดของฉัน">
          <h2>สังกัดของฉัน</h2>
          <ul>
            {user.memberships.map((m) => <li key={m.department_id}>{m.department_name} <Badge tone="info">{ROLE[m.role]}</Badge></li>)}
            {user.is_admin && <li>ผู้ดูแลสถาบัน <Badge tone="success">✓</Badge></li>}
            {user.memberships.length === 0 && !user.is_admin && <li className="muted">ยังไม่มีสังกัด</li>}
          </ul>
          <p className="muted">สังกัดแก้เองไม่ได้ หัวหน้าหรือผู้ดูแลเป็นผู้จัดการ</p>
        </section>
        <hr />
        <Button variant="tertiary" onClick={onSignOut}>ออกจากระบบ</Button>
      </div>
    </>
  );
}
