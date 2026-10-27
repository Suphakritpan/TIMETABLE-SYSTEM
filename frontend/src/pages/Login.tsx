// 0.1 ล็อกอิน (บัญชีในตัว ไม่ใช้บริการภายนอก ดู decisions O1/D12)
import { useState, type FormEvent } from 'react';
import Badge from '../components/ui/Badge';
import { login } from '../api/auth';
import Button from '../components/ui/Button';
import InlineAlert from '../components/ui/InlineAlert';
import { useSession } from '../context/Session';
import type { User } from '../types';

// ประเภทสถานศึกษาที่ระบบรองรับ (ADR 0002): อาชีวศึกษาใช้งานได้ ที่เหลือเป็นแผนงาน
const INSTITUTIONS: { label: string; ready: boolean }[] = [
  { label: 'อาชีวศึกษา', ready: true },
  { label: 'อุดมศึกษา', ready: false },
  { label: 'การศึกษาขั้นพื้นฐาน', ready: false },
];

export default function Login({ onDone }: { onDone: (u: User) => void }) {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      signIn(u);
      onDone(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="panel" onSubmit={submit} aria-labelledby="login-h">
        <h1 id="login-h">ระบบตารางเรียน</h1>
        <p className="muted">เข้าสู่ระบบด้วยบัญชีของสถาบัน</p>
        <ul className="inst" aria-label="ประเภทสถานศึกษาที่รองรับ">
          {INSTITUTIONS.map((i) => (
            <li key={i.label}>{i.label} <Badge tone={i.ready ? 'success' : 'neutral'}>{i.ready ? 'ใช้งานได้' : 'เร็ว ๆ นี้'}</Badge></li>
          ))}
        </ul>
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <label className="field">
          อีเมล
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          รหัสผ่าน
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Button>
        <p><a href="#/reset">ลืมรหัสผ่าน?</a></p>
        <p className="muted">
          ทดลอง (mock): head@ · assistant@ · teacher@ · admin@ · multi@ <code>demo.test</code> รหัสผ่าน <code>demo</code>
        </p>
      </form>
    </main>
  );
}
