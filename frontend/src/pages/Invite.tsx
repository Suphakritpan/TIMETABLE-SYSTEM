// 0.3 รับคำเชิญ: ผู้ใช้ใหม่ตั้งชื่อ+รหัสผ่าน · ผู้ใช้เดิมใส่รหัสผ่านเดิม · ลิงก์หมดอายุไม่สร้างบัญชี (flows F2)
import { useEffect, useState, type FormEvent } from 'react';
import { acceptInvite, getInvite, type InviteInfo } from '../api/people';
import { ApiException } from '../api/types';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import { useSession } from '../context/Session';
import type { User } from '../types';

const ROLE_LABEL = { TEACHER: 'อาจารย์', ASSISTANT: 'ผู้ช่วย', HEAD: 'หัวหน้า' } as const;

export default function Invite({ token, onDone, onLogin }: { token: string; onDone: (u: User) => void; onLogin: () => void }) {
  const { signIn } = useSession();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getInvite(token)
      .then((i) => { if (live) setInfo(i); })
      .catch((e: unknown) => { if (live) setProblem({ code: e instanceof ApiException ? e.code : 'ERROR', message: e instanceof Error ? e.message : 'เปิดลิงก์ไม่สำเร็จ' }); });
    return () => { live = false; };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    if (!info.has_account && password !== confirm) { setError('รหัสผ่านไม่ตรงกัน'); return; }
    setBusy(true);
    setError('');
    try {
      const u = await acceptInvite(token, { name, password });
      signIn(u);
      onDone(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'รับคำเชิญไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="panel" onSubmit={submit} aria-labelledby="inv-h">
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
                <TextField label="รหัสผ่านของบัญชีเดิม" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            ) : (
              <>
                <TextField label="ชื่อ" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
                <TextField label="รหัสผ่าน" type="password" autoComplete="new-password" required hint="อย่างน้อย 8 ตัวอักษร" value={password} onChange={(e) => setPassword(e.target.value)} />
                <TextField label="ยืนยันรหัสผ่าน" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </>
            )}
            <Button variant="primary" type="submit" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : info.has_account ? 'เข้าร่วม' : 'สร้างบัญชีและเข้าร่วม'}</Button>
          </>
        )}
      </form>
    </main>
  );
}
