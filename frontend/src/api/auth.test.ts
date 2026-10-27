import { login } from './auth';

test('ล็อกอินถูกต้องได้ผู้ใช้พร้อม memberships', async () => {
  vi.useFakeTimers();
  const p = login('Head@demo.test ', 'demo');
  await vi.advanceTimersByTimeAsync(400);
  const u = await p;
  vi.useRealTimers();
  expect(u.memberships[0].role).toBe('HEAD');
});
test('รหัสผิดและอีเมลไม่มี ให้ข้อความเดียวกัน', async () => {
  vi.useFakeTimers();
  const a = login('head@demo.test', 'x').catch((e: Error) => e.message);
  const b = login('nobody@demo.test', 'demo').catch((e: Error) => e.message);
  await vi.advanceTimersByTimeAsync(400);
  expect(await a).toBe(await b);
  vi.useRealTimers();
});
