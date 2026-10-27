import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getInstitution } from '../api/institution';
import { activeRole, type RoleContext } from '../auth/roles';
import type { InstitutionType, Role, User } from '../types';

interface Session {
  user: User | null;
  role: Role | null;
  /** แผนกที่ใช้งานอยู่ (สังกัดเดียว = แผนกนั้น, หลายแผนก = ที่เลือก, ไม่มี/โหมดผู้ดูแล = null) */
  departmentId: string | null;
  institutionType: InstitutionType;
  scope: RoleContext;
  signIn: (user: User) => void;
  signOut: () => void;
  switchTo: (scope: RoleContext) => void;
  /** แทนข้อมูลผู้ใช้ที่แก้แล้ว (เช่น เปลี่ยนชื่อ/ภาษาที่ 1.2) โดยคง scope เดิม */
  refreshUser: (user: User) => void;
}

const KEY = 'timetable.session';
const Ctx = createContext<Session | null>(null);

interface Stored { user: User; scope: RoleContext }

// sessionStorage เป็นแค่ความสะดวก (รีเฟรชแล้วไม่หลุด) ตัวจริงคือคุกกี้เซสชันฝั่ง backend; อ่าน/เขียนไม่ได้ก็ทำงานต่อได้
function load(): Stored | null {
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Stored) : null;
  } catch {
    return null;
  }
}
function save(v: Stored | null) {
  try {
    if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
    else sessionStorage.removeItem(KEY);
  } catch { /* ใช้งานต่อโดยไม่เก็บ */ }
}

function dept(s: Stored | null): string | null {
  if (!s || s.scope.asAdmin) return null;
  if (s.scope.departmentId) return s.scope.departmentId;
  return s.user.memberships.length === 1 ? s.user.memberships[0].department_id : null;
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Stored | null }) {
  const [state, setState] = useState<Stored | null>(() => initial ?? load());

  const signIn = useCallback((user: User) => {
    // หลายภาควิชา/หลายบทบาท: ยังไม่เลือก (ให้ผู้ใช้เลือกที่ตัวสลับ) ไม่เดาให้
    const next = { user, scope: {} };
    save(next);
    setState(next);
  }, []);
  const signOut = useCallback(() => { save(null); setState(null); }, []);
  const switchTo = useCallback((scope: RoleContext) => {
    setState((s) => {
      if (!s) return s;
      const next = { ...s, scope };
      save(next);
      return next;
    });
  }, []);

  const refreshUser = useCallback((user: User) => {
    setState((s) => {
      if (!s) return s;
      const next = { ...s, user };
      save(next);
      return next;
    });
  }, []);

  const value = useMemo<Session>(() => ({
    user: state?.user ?? null,
    role: activeRole(state?.user ?? null, state?.scope),
    departmentId: dept(state),
    institutionType: getInstitution()?.type ?? 'vocational',
    scope: state?.scope ?? {},
    signIn, signOut, switchTo, refreshUser,
  }), [state, signIn, signOut, switchTo, refreshUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession ต้องอยู่ใน SessionProvider');
  return v;
}
