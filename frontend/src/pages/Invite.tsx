// 0.3 รับคำเชิญ: ผู้ใช้ใหม่ตั้งชื่อ+รหัสผ่าน · ผู้ใช้เดิมใส่รหัสผ่านเดิม · ลิงก์หมดอายุไม่สร้างบัญชี (flows F2)
import { useEffect, useState, type FormEvent } from 'react';
import { MIN_PASSWORD, PHONE_RE, USERNAME_RE } from '../api/institution';
import { acceptInvite, getInvite, type InviteInfo } from '../api/people';
import { ApiException } from '../api/types';
import Icon from '../components/ui/Icon';
import ImagePick, { readImage } from '../components/ui/ImagePick';
import PasswordHelp from '../components/ui/PasswordHelp';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';
import type { User } from '../types';

const ROLE_LABEL = { TEACHER: 'อาจารย์', ASSISTANT: 'ผู้ช่วย', HEAD: 'หัวหน้า' } as const;

export default function Invite({ token, onDone, onLogin }: { token: string; onDone: (u: User) => void; onLogin: () => void }) {
  const { signIn } = useSession();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', phone: '', language: 'th' as 'th' | 'en', password: '', confirm: '' });
  const [userTouched, setUserTouched] = useState(false);
  const [avatar, setAvatar] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f | 'avatar' | 'terms', string>>>({});
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { password } = f;
  const pwType = show ? 'text' : 'password';
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getInvite(token)
      .then((i) => {
        if (!live) return;
        setInfo(i);
        const guess = i.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
        setF((p) => ({ ...p, username: guess.length >= 3 ? guess.slice(0, 30) : '' }));
      })
      .catch((e: unknown) => { if (live) setProblem({ code: e instanceof ApiException ? e.code : 'ERROR', message: e instanceof Error ? e.message : 'เปิดลิงก์ไม่สำเร็จ' }); });
    return () => { live = false; };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setError('');
    if (!info.has_account) {
      const next: typeof errors = {};
      if (!f.firstName.trim()) next.firstName = 'กรอกชื่อจริง';
      if (!f.lastName.trim()) next.lastName = 'กรอกนามสกุล';
      if (!USERNAME_RE.test(f.username.trim())) next.username = 'ชื่อผู้ใช้ 3–30 ตัว ใช้ a-z 0-9 . _ - เท่านั้น';
      if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) next.phone = 'เบอร์โทรศัพท์ไม่ถูกต้อง';
      if (f.password.length < MIN_PASSWORD) next.password = `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
      else if (f.password !== f.confirm) next.confirm = 'รหัสผ่านไม่ตรงกัน';
      if (!terms) next.terms = 'ต้องยอมรับข้อกำหนดก่อนสร้างบัญชี';
      setErrors(next);
      if (Object.keys(next).length) { setError('ตรวจข้อมูลที่ระบุไว้ในแบบฟอร์ม'); return; }
    }
    setBusy(true);
    try {
      const u = await acceptInvite(token, info.has_account ? { password } : {
        first_name: f.firstName, last_name: f.lastName, username: f.username, phone: f.phone, avatar, language: f.language, password,
      });
      signIn(u);
      onDone(u);
    } catch (err) {
      if (err instanceof ApiException && err.code === 'DUPLICATE_USERNAME') setErrors({ username: err.message });
      setError(err instanceof Error ? err.message : 'รับคำเชิญไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className={`panel auth-panel${info && !info.has_account ? ' wide' : ''}`} onSubmit={submit} aria-labelledby="inv-h" noValidate>
        <span className="brand-mark"><Icon name="calendar" size={30} /></span>
        <h1 id="inv-h">รับคำเชิญ</h1>
        {!info && !problem && <Skeleton lines={3} label="กำลังตรวจคำเชิญ" />}
        {problem && (
          <>
            <InlineAlert tone="error">{problem.message}</InlineAlert>
            <p className="muted">{problem.code === 'INVITE_EXPIRED' ? 'ยังไม่ได้สร้างบัญชีให้ ติดต่อผู้เชิญเพื่อขอลิงก์ใหม่' : 'ตรวจลิงก์อีกครั้ง หรือขอลิงก์ใหม่จากผู้เชิญ'}</p>
            <Button onClick={onLogin}>ไปหน้าเข้าสู่ระบบ</Button>
          </>
        )}
        {info && (
          <>
            <p>คุณถูกเชิญเข้า <b>{info.department_name}</b> ในบทบาท <Badge tone="info">{ROLE_LABEL[info.role]}</Badge></p>
            <p className="muted">อีเมล: {info.email}</p>
            {error && <InlineAlert tone="error">{error}</InlineAlert>}
            {info.has_account ? (
              <>
                <InlineAlert tone="info">อีเมลนี้มีบัญชีอยู่แล้ว ใส่รหัสผ่านเดิมเพื่อเพิ่มแผนกนี้ให้บัญชีเดียวกัน</InlineAlert>
                <TextField label="รหัสผ่านของบัญชีเดิม" type="password" autoComplete="current-password" value={f.password} onChange={set('password')} />
              </>
            ) : (
              <>
                <fieldset className="setup-group">
                  <legend>ข้อมูลของคุณ</legend>
                  <div className="setup-grid">
                    <TextField label="ชื่อจริง" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} error={errors.firstName} />
                    <TextField label="นามสกุล" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} error={errors.lastName} />
                    <TextField label="อีเมล" type="email" readOnly value={info.email} hint="อีเมลที่ผู้เชิญระบุไว้ แก้ไม่ได้" />
                    <TextField label="ชื่อผู้ใช้ (Username)" autoComplete="off" value={f.username} onChange={(e) => { setUserTouched(true); set('username')(e); }} error={errors.username} hint={userTouched ? 'ใช้เข้าสู่ระบบแทนอีเมลได้' : 'เติมจากอีเมลให้ แก้ได้'} />
                    <TextField label="เบอร์โทรศัพท์ (ไม่บังคับ)" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
                    <SelectField label="ภาษา" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as 'th' | 'en' })}><option value="th">ไทย</option><option value="en">English</option></SelectField>
                  </div>
                  <ImagePick label="รูปโปรไฟล์" value={avatar} error={errors.avatar} onPick={(file) => readImage(file).then((v) => { setAvatar(v); setErrors((p) => ({ ...p, avatar: undefined })); }, (e: Error) => setErrors((p) => ({ ...p, avatar: e.message })))} onClear={() => setAvatar(undefined)} />
                </fieldset>
                <fieldset className="setup-group">
                  <legend>ตั้งรหัสผ่าน</legend>
                  <div className="setup-grid">
                    <TextField label="รหัสผ่าน" type={pwType} autoComplete="new-password" hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} value={f.password} onChange={set('password')} error={errors.password} />
                    <TextField label="ยืนยันรหัสผ่าน" type={pwType} autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />
                  </div>
                  <div className="pw-row">
                    <Button variant="tertiary" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</Button>
                  </div>
                  <PasswordHelp value={f.password} />
                </fieldset>
                <label className="check"><input type="checkbox" checked={terms} aria-invalid={errors.terms ? true : undefined} onChange={(e) => setTerms(e.target.checked)} /> ฉันยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว</label>
                {errors.terms && <span className="field-error"><span aria-hidden="true">✕ </span>{errors.terms}</span>}
              </>
            )}
            <Button variant="primary" type="submit" className="btn-block" loading={busy}>{busy ? 'กำลังดำเนินการ…' : info.has_account ? 'เข้าร่วม' : 'สร้างบัญชีและเข้าร่วม'}</Button>
          </>
        )}
      </form>
    </main>
  );
}
