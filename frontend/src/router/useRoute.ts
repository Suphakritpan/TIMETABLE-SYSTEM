import { useCallback, useSyncExternalStore } from 'react';
import { isRouteKey, type RouteKey } from '../auth/roles';

// เราท์แบบ hash (#/timetable) ไม่ต้องใช้ไลบรารี และทำงานได้เมื่อ host เป็นไฟล์สถิตหลัง nginx โดยไม่ต้องตั้ง rewrite
export interface Route { key: RouteKey; id?: string }

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const snapshot = () => window.location.hash;

/** `#/profiles` -> profiles · `#/profiles/p1` -> workspace(id=p1) · อื่น ๆ ตามชื่อคีย์ · ไม่รู้จัก -> null */
export function parseHash(hash: string): Route | null {
  const path = hash.replace(/^#\/?/, '');
  const m = /^profiles\/([\w-]+)$/.exec(path);
  if (m) return { key: 'workspace', id: m[1] };
  const inv = /^invite\/([\w-]+)$/.exec(path);
  if (inv) return { key: 'invite', id: inv[1] };
  const rst = /^reset\/([\w-]+)$/.exec(path);
  if (rst) return { key: 'reset', id: rst[1] };
  return isRouteKey(path) && path !== 'workspace' && path !== 'invite' ? { key: path } : null;
}

export const hrefFor = ({ key, id }: Route): string =>
  key === 'workspace' && id ? `#/profiles/${id}` : key === 'invite' && id ? `#/invite/${id}` : key === 'reset' && id ? `#/reset/${id}` : `#/${key}`;

export function useRoute(): [Route | null, (to: Route | RouteKey) => void] {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const go = useCallback((to: Route | RouteKey) => { window.location.hash = hrefFor(typeof to === 'string' ? { key: to } : to).slice(1); }, []);
  return [parseHash(hash), go];
}
