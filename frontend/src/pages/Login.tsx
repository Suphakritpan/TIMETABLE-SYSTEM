// 0.1 ล็อกอิน (บัญชีในตัว ไม่ใช้บริการภายนอก ดู decisions O1/D12)
import { useState, type FormEvent } from 'react';
import Badge from '../components/ui/Badge';
import { login } from '../api/auth';
import Button from '../components/ui/Button';
import Icon, { type IconName } from '../components/ui/Icon';
import InlineAlert from '../components/ui/InlineAlert';
import SearchSelect from '../components/ui/SearchSelect';
import { INSTITUTION_NAMES } from '../data/institutions';
import { useSession } from '../context/Session';
import type { User } from '../types';

// ประเภทสถานศึกษาที่ระบบรองรับ (ADR 0002): อาชีวศึกษาใช้งานได้ ที่เหลือเป็นแผนงาน
const INSTITUTIONS: { label: string; ready: boolean }[] = [
  { label: 'อาชีวศึกษา', ready: true },
  { label: 'อุดมศึกษา', ready: false },
  { label: 'การศึกษาขั้นพื้นฐาน', ready: false },
];

// ข้อความอธิบายระบบ (ตรงกับเอกสารนักพัฒนา doc/site) ไม่ใส่ตัวเลขสถิติที่ไม่มีที่มา
const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'file', title: 'อ่านหลักสูตรจากไฟล์', desc: 'นำเข้าข้อมูลรายวิชาจากไฟล์หลักสูตร แล้วตรวจทานก่อนใช้' },
  { icon: 'calendar', title: 'จัดตารางไม่ชนกัน', desc: 'สร้างตารางที่อาจารย์ ห้อง และกลุ่มเรียนไม่ซ้อนกัน' },
  { icon: 'people', title: 'วางแผนร่วมกัน', desc: 'หัวหน้าแผนกและอาจารย์ร่วมกำหนดเวลาว่างและรายการแก้ไข' },
  { icon: 'print', title: 'พิมพ์ได้ทันที', desc: 'ส่งออกตารางเป็น A4 ให้นักศึกษาดูโดยไม่ต้องล็อกอิน' },
];
const ROLES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'user', title: 'หัวหน้าแผนก / ผู้ช่วย', desc: 'ตั้งกติกา จัดตาราง ตรวจปัญหา และเผยแพร่' },
  { icon: 'calendar', title: 'อาจารย์', desc: 'ระบุเวลาว่าง ดูตารางและแจ้งขอแก้ไข' },
  { icon: 'shield', title: 'ผู้ดูแลสถาบัน', desc: 'จัดการแผนก ภาคเรียน วันหยุด และห้องร่วม' },
];
const LAST = 'timetable.lastInstitution';
const DEMO = ['head', 'assistant', 'teacher', 'admin', 'multi'];

export default function Login({ onDone }: { onDone: (u: User) => void }) {
  const { signIn } = useSession();
  // จำสถานศึกษาที่ล็อกอินล่าสุดในเบราว์เซอร์นี้ ไม่ต้องเลือกซ้ำทุกครั้ง
  const [institution, setInstitution] = useState(() => {
    try { const v = localStorage.getItem(LAST); return v && INSTITUTION_NAMES.includes(v) ? v : ''; } catch { return ''; }
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!institution) { setError('กรุณาเลือกสถานศึกษา'); return; }
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      try { localStorage.setItem(LAST, institution); } catch { /* ไม่จำค่า */ }
      signIn(u);
      onDone(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <aside className="auth-side">
          <span className="auth-art" aria-hidden="true"><Icon name="people" size={64} /></span>
          <h2>กลุ่มผู้ใช้งานระบบ</h2>
          <ul className="auth-roles">
            {ROLES.map((r) => <li key={r.title}><strong>{r.title}</strong><span>{r.desc}</span></li>)}
          </ul>
          <ul className="auth-inst" aria-label="ประเภทสถานศึกษาที่รองรับ">
            {INSTITUTIONS.map((i) => (
              <li key={i.label}><span>{i.label}</span><Badge tone={i.ready ? 'success' : 'neutral'}>{i.ready ? 'ใช้งานได้' : 'เร็ว ๆ นี้'}</Badge></li>
            ))}
          </ul>
          <p className="auth-note">ลืมรหัสผ่านหรือเข้าระบบไม่ได้ ให้ใช้ลิงก์ “ลืมรหัสผ่าน” หรือติดต่อผู้ดูแลสถาบัน</p>
        </aside>

        <form className="auth-form" onSubmit={submit} aria-labelledby="login-h">
          <span className="brand-mark"><Icon name="calendar" size={30} /></span>
          <h1 id="login-h">ระบบตารางเรียน</h1>
          <p className="muted">จัดตารางเรียนอัตโนมัติสำหรับสถานศึกษา</p>
          <p className="auth-sub">เข้าใช้งานระบบ</p>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <SearchSelect label="สถานศึกษา" placeholder="-- เลือกสถานศึกษา --" options={INSTITUTION_NAMES} value={institution} onChange={setInstitution} />
          <label className="field">
            อีเมลหรือชื่อผู้ใช้
            <input className="input" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            รหัสผ่าน
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button variant="primary" type="submit" className="btn-block" loading={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Button>
          <p className="center"><a href="#/reset">ลืมรหัสผ่าน?</a></p>
          <div className="or" role="separator"><span>หรือ</span></div>
          <div className="muted center">ทดลอง (mock) กดเพื่อกรอกบัญชี รหัสผ่านคือ <code>demo</code></div>
          <div className="chips center-row">
            {DEMO.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => { setEmail(`${n}@demo.test`); setPassword('demo'); }}>{n}@</button>
            ))}
          </div>
        </form>
      </div>

      <section className="auth-info" aria-label="ภาพรวมระบบ">
        <div className="tile-grid compact">
          {FEATURES.map((f) => (
            <div key={f.title} className="tile static">
              <span className="tile-icon"><Icon name={f.icon} size={26} /></span>
              <strong>{f.title}</strong>
              <span className="muted">{f.desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
