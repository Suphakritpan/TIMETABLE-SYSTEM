// 0.2 ลืม/รีเซ็ตรหัสผ่าน (D12 ข้อ 4): ขอเอง (ไม่มี SMTP = ไม่มีอีเมลถูกส่ง ให้ขอลิงก์จากหัวหน้า/ผู้ดูแล) หรือตั้งรหัสใหม่ด้วยลิงก์
import { useEffect, useState, type FormEvent } from 'react';
import { confirmReset, getReset, requestReset } from '../api/account';
import { MIN_PASSWORD } from '../api/institution';
import { ApiException } from '../api/types';
import Button from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';

export default function Reset({ token, onLogin }: { token?: string; onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [who, setWho] = useState<string | null | undefined>(token ? undefined : null);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    getReset(token)
      .then((r) => { if (live) setWho(r.name); })
      .catch((e: unknown) => { if (live) setProblem({ code: e instanceof ApiException ? e.code : 'ERROR', message: e instanceof Error ? e.message : 'เปิดลิงก์ไม่สำเร็จ' }); });
    return () => { live = false; };
  }, [token]);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    setMsg((await requestReset(email)).message);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (pw !== confirm) { setError('รหัสผ่านไม่ตรงกัน'); return; }
    setError('');
    try { await confirmReset(token, pw); setDone(true); } catch (err) { setError(err instanceof Error ? err.message : 'ตั้งรหัสไม่สำเร็จ'); }
  };

  return (
    <main className="login">
      <form className="panel" onSubmit={token ? save : request} aria-labelledby="rs-h">
        <h1 id="rs-h">{token ? 'ตั้งรหัสผ่านใหม่' : 'ลืมรหัสผ่าน'}</h1>
        {!token && (
          <>
            {msg && <InlineAlert tone="info">{msg}</InlineAlert>}
            <TextField label="อีเมล" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="primary" type="submit">ส่งลิงก์รีเซ็ต</Button>
            <p className="muted">ถ้าไม่ได้รับอีเมล ให้ขอลิงก์จากหัวหน้า{'แผนก'}หรือผู้ดูแลระบบสถาบัน</p>
          </>
        )}
        {token && who === undefined && !problem && <Skeleton lines={3} label="กำลังตรวจลิงก์" />}
        {token && problem && <InlineAlert tone="error">{problem.message}</InlineAlert>}
        {token && who && !done && (
          <>
            <p>ตั้งรหัสผ่านใหม่ให้ <b>{who}</b></p>
            {error && <InlineAlert tone="error">{error}</InlineAlert>}
            <TextField label="รหัสผ่านใหม่" type="password" autoComplete="new-password" required hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} value={pw} onChange={(e) => setPw(e.target.value)} />
            <TextField label="ยืนยันรหัสผ่าน" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button variant="primary" type="submit">บันทึกรหัสผ่าน</Button>
          </>
        )}
        {done && <InlineAlert tone="success">เปลี่ยนรหัสผ่านแล้ว เข้าสู่ระบบด้วยรหัสใหม่ได้เลย</InlineAlert>}
        <p><Button variant="tertiary" onClick={onLogin}>กลับไปหน้าเข้าสู่ระบบ</Button></p>
      </form>
    </main>
  );
}
