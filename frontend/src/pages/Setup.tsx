// 0.0 ตั้งค่าครั้งแรก: แสดงครั้งเดียวหลังติดตั้ง (docker compose up) ตั้งสถาบัน ประเภท ภาษา และผู้ดูแลคนแรก
import { useState, type FormEvent } from 'react';
import { MIN_PASSWORD, seedDemoInstitution, setup } from '../api/institution';
import Button from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import { useSession } from '../context/Session';

type Errors = Partial<Record<'name' | 'adminName' | 'email' | 'password' | 'confirm', string>>;

export default function Setup({ onDone }: { onDone: () => void }) {
  const { signIn } = useSession();
  const [f, setF] = useState({ name: '', language: 'th' as 'th' | 'en', adminName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!f.name.trim()) next.name = 'กรอกชื่อสถาบัน';
    if (!f.adminName.trim()) next.adminName = 'กรอกชื่อผู้ดูแล';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) next.email = 'อีเมลไม่ถูกต้อง';
    if (f.password.length < MIN_PASSWORD) next.password = `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
    if (f.confirm !== f.password) next.confirm = 'รหัสผ่านไม่ตรงกัน';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFail('');
    try {
      const admin = await setup({ name: f.name, type: 'vocational', language: f.language, adminName: f.adminName, email: f.email, password: f.password });
      signIn(admin);
      onDone();
    } catch (err) {
      setFail(err instanceof Error ? err.message : 'ตั้งค่าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="panel" onSubmit={submit} aria-labelledby="setup-h" noValidate>
        <h1 id="setup-h">ตั้งค่าครั้งแรก</h1>
        <p className="muted">หน้านี้แสดงครั้งเดียวหลังติดตั้ง ใช้ตั้งชื่อสถาบันและบัญชีผู้ดูแลคนแรก</p>
        {fail && <InlineAlert tone="error">{fail}</InlineAlert>}
        <TextField label="ชื่อสถาบัน" value={f.name} onChange={set('name')} error={errors.name} />
        <SelectField label="ประเภทสถานศึกษา" hint="ตอนนี้รองรับอาชีวศึกษาเท่านั้น (อุดมศึกษาและการศึกษาขั้นพื้นฐานอยู่ในแผน)" value="vocational" onChange={() => {}}>
          <option value="vocational">อาชีวศึกษา</option>
        </SelectField>
        <SelectField label="ภาษา" value={f.language} onChange={set('language')}>
          <option value="th">ไทย</option>
          <option value="en">English</option>
        </SelectField>
        <TextField label="ชื่อผู้ดูแล" value={f.adminName} onChange={set('adminName')} error={errors.adminName} />
        <TextField label="อีเมลผู้ดูแล" type="email" autoComplete="username" value={f.email} onChange={set('email')} error={errors.email} />
        <TextField label="รหัสผ่าน" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} />
        <TextField label="ยืนยันรหัสผ่าน" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'กำลังตั้งค่า…' : 'ตั้งค่าและเข้าสู่ระบบ'}</Button>
        <p className="muted">
          ทดลอง (mock):{' '}
          <button type="button" className="th-btn link" onClick={() => { seedDemoInstitution(); onDone(); }}>ข้ามไปใช้สถาบันและบัญชีตัวอย่าง</button>
        </p>
      </form>
    </main>
  );
}
