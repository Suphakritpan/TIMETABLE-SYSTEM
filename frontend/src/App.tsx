import { useEffect, useState } from 'react';
import { needsSetup } from './api/institution';
import { unreadCount } from './api/notifications';
import { canAccess, homeFor, isPublic } from './auth/roles';
import AppShell from './components/layout/AppShell';
import InlineAlert from './components/ui/InlineAlert';
import { ToastProvider } from './components/ui/Toast';
import { SessionProvider, useSession } from './context/Session';
import Account from './pages/Account';
import Admin from './pages/Admin';
import Home from './pages/Home';
import Invite from './pages/Invite';
import MyAvailability from './pages/MyAvailability';
import MyIssues from './pages/MyIssues';
import MyRequests from './pages/MyRequests';
import MyTimetable from './pages/MyTimetable';
import TeacherHome from './pages/TeacherHome';
import Notifications from './pages/Notifications';
import People from './pages/People';
import Login from './pages/Login';
import Profiles from './pages/Profiles';
import Reset from './pages/Reset';
import ReviewExtract from './pages/ReviewExtract';
import Structure from './pages/Structure';
import Setup from './pages/Setup';
import Timetable from './pages/Timetable';
import Workspace from './pages/Workspace';
import { hrefFor, parseHash, useRoute, type Route } from './router/useRoute';

function Routes() {
  const { user, role, departmentId, signOut } = useSession();
  const [hashRoute, go] = useRoute();
  const [status, setStatus] = useState('');
  const [fresh, setFresh] = useState(needsSetup);
  const [unread, setUnread] = useState(0);
  const [bump, setBump] = useState(0); // นับครั้งที่อ่านการแจ้งเตือน เพื่อดึงจำนวนที่ยังไม่อ่านใหม่
  // ลิงก์ลึกที่เปิดมาก่อนล็อกอิน: พาไปหน้านั้นหลังล็อกอินสำเร็จ (ถ้ามีสิทธิ์)
  const [entry] = useState<Route | null>(() => { const r = parseHash(window.location.hash); return r && !isPublic(r.key) ? r : null; });
  const wanted = hashRoute && !isPublic(hashRoute.key) ? hashRoute : entry;

  // ยังไม่ล็อกอิน: เพิ่งติดตั้ง -> 0.0 ไม่งั้น -> 0.1 · ล็อกอินแล้ว: ไปหน้าที่ขอถ้ามีสิทธิ์ ไม่งั้นหน้าแรกตามบทบาท
  const allowed = wanted !== null && canAccess(wanted.key, role);
  const inviteRoute = !user && !fresh && ((hashRoute?.key === 'invite' && hashRoute.id) || hashRoute?.key === 'reset') ? hashRoute : null;
  const target: Route = !user ? (inviteRoute ?? { key: fresh ? 'setup' : 'login' }) : allowed ? wanted : { key: homeFor(role) };
  const denied = user && role !== null && wanted !== null && !allowed;

  useEffect(() => {
    if (!user) return;
    let live = true;
    void unreadCount(user.id).then((n) => { if (live) setUnread(n); });
    return () => { live = false; };
  }, [user, target.key, bump]);

  useEffect(() => {
    if (hrefFor(target) !== window.location.hash) go(target);
  }, [target.key, target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    if (fresh) return <Setup onDone={() => setFresh(false)} />;
    if (inviteRoute?.key === 'reset') return <Reset token={inviteRoute.id} onLogin={() => go('login')} />;
    if (inviteRoute?.id) return <Invite token={inviteRoute.id} onDone={() => setStatus('')} onLogin={() => go('login')} />;
    return <Login onDone={() => setStatus('')} />;
  }

  const nav = (r: Route) => { setStatus(''); go(r); };
  const dept = departmentId ?? '';
  return (
    <AppShell route={target} onNav={nav} status={status} unread={unread}>
      {role === null && <InlineAlert tone="info">เลือกแผนกวิชาที่ต้องการใช้งานจากตัวสลับด้านบน</InlineAlert>}
      {denied && <InlineAlert tone="warning">คุณไม่มีสิทธิ์เข้าหน้านี้ จึงพากลับหน้าแรก</InlineAlert>}
      {role && target.key === 'home' && dept && <Home departmentId={dept} onOpen={(id) => nav({ key: 'workspace', id })} onProfiles={() => nav({ key: 'profiles' })} />}
      {role && target.key === 'notifications' && <Notifications onChanged={() => setBump((n) => n + 1)} />}
      {role && target.key === 'account' && <Account onSignOut={signOut} />}
      {role && target.key === 'people' && dept && <People departmentId={dept} />}
      {role && target.key === 'profiles' && dept && <Profiles departmentId={dept} onOpen={(id) => nav({ key: 'workspace', id })} />}
      {role && target.key === 'workspace' && target.id && <Workspace key={target.id} id={target.id} setStatus={setStatus} onBack={() => nav({ key: 'profiles' })} />}
      {role && target.key === 'timetable' && <Timetable setStatus={setStatus} />}
      {role && target.key === 'review' && <ReviewExtract />}
      {role && target.key === 't-home' && <TeacherHome onAvailability={() => nav({ key: 'availability' })} />}
      {role && target.key === 'availability' && <MyAvailability />}
      {role && target.key === 'my-issues' && <MyIssues />}
      {role && target.key === 'my-timetable' && <MyTimetable />}
      {role && target.key === 'my-requests' && <MyRequests />}
      {role && target.key === 'structure' && <Structure />}
      {role && target.key === 'admin' && <Admin />}
    </AppShell>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </SessionProvider>
  );
}
