// 1.2 บัญชีของฉัน: ชื่อ ภาษา อีเมล รหัสผ่าน + สังกัดของฉัน (อ่านอย่างเดียว) — ชั่วโมงสอนสูงสุดต่อวันอยู่ที่ 4.2 เพราะเป็นค่าต่อภาคเรียน (D12)
import { useState, type FormEvent } from 'react';
import { changePassword, transferAdmin, updateEmail, updateMe } from '../api/account';
import { allUsers } from '../api/auth';
import { MIN_PASSWORD } from '../api/institution';
import Avatar from '../components/ui/Avatar';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import ImagePick, { readImage } from '../components/ui/ImagePick';
import SearchSelect from '../components/ui/SearchSelect';
import InlineAlert from '../components/ui/InlineAlert';
import { useToast } from '../components/ui/Toast';
import { useSession } from '../context/Session';

const ROLE = { HEAD: 'หัวหน้า', ASSISTANT: 'ผู้ช่วย', TEACHER: 'ครู/อาจารย์' } as const;

export default function Account({ onSignOut }: { onSignOut: () => void }) {
  const toast = useToast();
  const { user, refreshUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [language, setLanguage] = useState<'th' | 'en'>(user?.language ?? 'th');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatar, setAvatar] = useState(user?.avatar);
  const [imgErr, setImgErr] = useState<string>();
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPw, setEmailPw] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [target, setTarget] = useState('');
  const [tPw, setTPw] = useState('');
  const [sure, setSure] = useState(false);
  const [tErr, setTErr] = useState<{ target?: string; pw?: string; sure?: string }>({});
  const [errors, setErrors] = useState<{ profile?: string; email?: string; password?: string; transfer?: string }>({});
  if (!user) return null;

  const run = async (key: 'profile' | 'email' | 'password' | 'transfer', fn: () => Promise<void>, ok: string) => {
    setErrors((e) => ({ ...e, [key]: undefined }));
    try { await fn(); toast.show(ok); } catch (e) { setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : 'ไม่สำเร็จ' })); }
  };
  const saveProfile = (e: FormEvent) => { e.preventDefault(); void run('profile', async () => refreshUser(await updateMe(user.id, { name, language, phone, avatar })), 'บันทึกข้อมูลแล้ว'); };
  const saveEmail = (e: FormEvent) => { e.preventDefault(); void run('email', async () => { refreshUser(await updateEmail(user.id, email, emailPw)); setEmailPw(''); }, 'เปลี่ยนอีเมลแล้ว'); };
  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) { setErrors((x) => ({ ...x, password: 'รหัสผ่านใหม่ไม่ตรงกัน' })); return; }
    void run('password', async () => { await changePassword(user.id, cur, next); setCur(''); setNext(''); setAgain(''); }, 'เปลี่ยนรหัสผ่านแล้ว');
  };

  // ตัวเลือกผู้รับ: ทุกบัญชีที่ไม่ใช่ตัวเอง แสดงเป็น "ชื่อ (อีเมล)"
  const people = allUsers().filter((u) => u.id !== user.id);
  const label = (u: { name: string; email: string }) => `${u.name} (${u.email})`;
  const saveTransfer = (e: FormEvent) => {
    e.preventDefault();
    const to = people.find((u) => label(u) === target);
    const next: typeof tErr = {};
    if (!to) next.target = 'เลือกผู้รับสิทธิ์จากรายการ';
    if (!tPw) next.pw = 'กรอกรหัสผ่านปัจจุบันเพื่อยืนยัน';
    if (!sure) next.sure = 'ติ๊กยืนยันว่ารับทราบก่อนโอน';
    setTErr(next);
    if (!to || Object.keys(next).length) return;
    void run('transfer', async () => { refreshUser(await transferAdmin(user.id, to.id, tPw)); setTarget(''); setTPw(''); setSure(false); }, `โอนสิทธิ์ผู้ดูแลให้ ${to.name} แล้ว`);
  };

  return (
    <>
      <PageHeader title="บัญชีของฉัน" subtitle="ข้อมูลส่วนตัว อีเมล และรหัสผ่าน" />
      <section className="profile-hero" aria-label="สรุปบัญชี">
        {user.avatar ? <img className="avatar avatar-xl" src={user.avatar} alt="" /> : <span className="avatar avatar-xl"><Avatar name={user.name} /></span>}
        <div>
          <strong className="profile-name">{user.name}</strong>
          <div className="muted">{user.email}</div>
          <div className="chips-row">
            {user.memberships.map((m) => <Badge key={m.department_id} tone="info">{m.department_name} · {ROLE[m.role]}</Badge>)}
            {user.is_admin && <Badge tone="success">ผู้ดูแลสถาบัน</Badge>}
          </div>
        </div>
      </section>
      <div className="account-grid">
        <form className="card" onSubmit={saveProfile} aria-label="ข้อมูลส่วนตัว">
          <h2>ข้อมูลส่วนตัว</h2>
          {errors.profile && <InlineAlert tone="error">{errors.profile}</InlineAlert>}
          <TextField label="ชื่อ" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="เบอร์โทรศัพท์ (ไม่บังคับ)" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ImagePick label="รูปโปรไฟล์" value={avatar} error={imgErr} onPick={(f) => readImage(f).then((v) => { setAvatar(v); setImgErr(undefined); }, (e: Error) => setImgErr(e.message))} onClear={() => setAvatar(undefined)} />
          <SelectField label="ภาษา" value={language} onChange={(e) => setLanguage(e.target.value as 'th' | 'en')}><option value="th">ไทย</option><option value="en">English</option></SelectField>
          <div className="actions"><Button variant="primary" type="submit">บันทึก</Button></div>
        </form>
        <form className="card" onSubmit={saveEmail} aria-label="อีเมล">
          <h2>อีเมล</h2>
          {errors.email && <InlineAlert tone="error">{errors.email}</InlineAlert>}
          <TextField label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="รหัสผ่านปัจจุบัน (ยืนยันการเปลี่ยนอีเมล)" type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
          <Button type="submit">เปลี่ยนอีเมล</Button>
        </form>
        <form className="card" onSubmit={savePassword} aria-label="เปลี่ยนรหัสผ่าน">
          <h2>เปลี่ยนรหัสผ่าน</h2>
          {errors.password && <InlineAlert tone="error">{errors.password}</InlineAlert>}
          <TextField label="รหัสผ่านปัจจุบัน" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <TextField label="รหัสผ่านใหม่" type="password" autoComplete="new-password" hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} value={next} onChange={(e) => setNext(e.target.value)} />
          <TextField label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          <Button type="submit">เปลี่ยนรหัสผ่าน</Button>
        </form>
        <section className="card" aria-label="สังกัดของฉัน">
          <h2>สังกัดของฉัน</h2>
          <ul>
            {user.memberships.map((m) => <li key={m.department_id}>{m.department_name} <Badge tone="info">{ROLE[m.role]}</Badge></li>)}
            {user.is_admin && <li>ผู้ดูแลสถาบัน <Badge tone="success">ใช่</Badge></li>}
            {user.memberships.length === 0 && !user.is_admin && <li className="muted">ยังไม่มีสังกัด</li>}
          </ul>
          <p className="muted">สังกัดแก้เองไม่ได้ หัวหน้าหรือผู้ดูแลเป็นผู้จัดการ</p>
        </section>
        {user.is_admin && (
          <>
            <form className="card card-danger" onSubmit={saveTransfer} aria-label="โอนสิทธิ์ผู้ดูแล" noValidate>
              <h2>โอนสิทธิ์ผู้ดูแลสถาบัน</h2>
              <p className="muted">ส่งต่อสิทธิ์ผู้ดูแลหลักให้บัญชีอื่น เมื่อโอนแล้วคุณจะไม่ใช่ผู้ดูแลอีก และยกเลิกเองไม่ได้ ต้องให้ผู้รับโอนกลับมาให้</p>
              {errors.transfer && <InlineAlert tone="error">{errors.transfer}</InlineAlert>}
              <SearchSelect label="ผู้รับสิทธิ์" placeholder="-- เลือกบัญชีผู้รับ --" options={people.map(label)} value={target} onChange={setTarget} />
              {tErr.target && <p role="alert" className="field-error">{tErr.target}</p>}
              <TextField label="รหัสผ่านปัจจุบัน (ยืนยันการโอน)" type="password" autoComplete="current-password" value={tPw} onChange={(e) => setTPw(e.target.value)} error={tErr.pw} />
              <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> ฉันเข้าใจว่าจะสูญเสียสิทธิ์ผู้ดูแลสถาบันหลังโอน</label>
              {tErr.sure && <p role="alert" className="field-error">{tErr.sure}</p>}
              <Button variant="destructive" type="submit">โอนสิทธิ์ผู้ดูแล</Button>
            </form>
              </>
        )}
        <div className="account-foot"><Button variant="tertiary" onClick={onSignOut}>ออกจากระบบ</Button></div>
      </div>
    </>
  );
}
