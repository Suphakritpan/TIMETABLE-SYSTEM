// Top bar / Nav / Workspace / Status bar. Command toolbar อยู่ในแต่ละหน้า (คำสั่งต่างกันตามหน้า)
import type { ReactNode } from 'react';
import { canAccess, switcherOptions, type RouteKey } from '../../auth/roles';
import { hrefFor, type Route } from '../../router/useRoute';
import { useSession } from '../../context/Session';
import { term } from '../../utils/terminology';
import Button from '../ui/Button';

const NAV: [RouteKey, string][] = [
  ['home', 'หน้าแรก'],
  ['profiles', 'โปรไฟล์'],
  ['people', 'บุคลากรและห้อง'],
  ['timetable', 'สร้างตาราง (ต้นแบบ)'],
  ['review', 'ตรวจทานตารางที่สกัดได้ (ต้นแบบ)'],
  ['t-home', 'หน้าแรกของฉัน'],
  ['availability', 'เวลาว่างของฉัน'],
  ['my-issues', 'รายการของฉัน'],
  ['my-timetable', 'ตารางของฉัน'],
  ['my-requests', 'คำขอของฉัน'],
  ['admin', 'ผู้ดูแลสถาบัน'],
  ['notifications', 'การแจ้งเตือน'],
  ['account', 'บัญชีของฉัน'],
];

interface Props { children: ReactNode; route: Route; onNav: (r: Route) => void; status?: string; unread?: number }

export default function AppShell({ children, route, onNav, status = '', unread = 0 }: Props) {
  const { user, role, institutionType, scope, switchTo, signOut } = useSession();
  const options = user ? switcherOptions(user) : [];
  const current = options.find((o) => (o.asAdmin ? scope.asAdmin : o.departmentId === scope.departmentId))?.key ?? '';

  return (
    <div className="shell">
      <a className="skip-link" href="#main">ข้ามไปเนื้อหา</a>
      <header className="topbar">
        <strong>ระบบตารางเรียน</strong>
        <span className="spacer" />
        {options.length > 1 && (
          <label className="switcher">
            <span className="sr-only">{term(institutionType, 'department')}ที่ใช้งาน</span>
            <select
              className="input"
              value={current}
              onChange={(e) => {
                const o = options.find((x) => x.key === e.target.value);
                if (o) switchTo({ departmentId: o.departmentId, asAdmin: o.asAdmin });
              }}
            >
              <option value="" disabled>เลือก{term(institutionType, 'department')}…</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        )}
        <span className="topbar-user">{user?.name}</span>
        <Button variant="tertiary" onClick={signOut}>ออกจากระบบ</Button>
      </header>
      <nav className="nav" aria-label="เมนูหลัก">
        {NAV.filter(([k]) => canAccess(k, role)).map(([k, label]) => (
          <a key={k} href={hrefFor({ key: k })} onClick={(e) => { e.preventDefault(); onNav({ key: k }); }} aria-current={k === route.key || (k === 'profiles' && route.key === 'workspace') ? 'page' : undefined}>{label}{k === 'notifications' && unread > 0 ? ` (${unread})` : ''}</a>
        ))}
      </nav>
      <main id="main" tabIndex={-1} className="workspace">{children}</main>
      <footer className="statusbar"><div role="status">{status}</div></footer>
    </div>
  );
}
