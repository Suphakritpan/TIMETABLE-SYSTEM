import { hrefFor, parseHash } from './useRoute';

test('อ่านคีย์เส้นทางจาก hash', () => {
  expect(parseHash('#/people')).toEqual({ key: 'people' });
  expect(parseHash('#people')).toEqual({ key: 'people' });
  expect(parseHash('#/t-home')).toEqual({ key: 't-home' });
  expect(parseHash('#/setup')).toEqual({ key: 'setup' });
});
test('พื้นที่ทำงานของโปรไฟล์มี id', () => {
  expect(parseHash('#/profiles/p-1')).toEqual({ key: 'workspace', id: 'p-1' });
  expect(parseHash('#/profiles')).toEqual({ key: 'profiles' });
  expect(hrefFor({ key: 'workspace', id: 'p-1' })).toBe('#/profiles/p-1');
  expect(hrefFor({ key: 'home' })).toBe('#/home');
});
test('ลิงก์เชิญมีโทเค็น และ #/invite เปล่าไม่ใช่เส้นทาง', () => {
  expect(parseHash('#/invite/tk1xabc')).toEqual({ key: 'invite', id: 'tk1xabc' });
  expect(hrefFor({ key: 'invite', id: 'tk1xabc' })).toBe('#/invite/tk1xabc');
  expect(parseHash('#/invite')).toBeNull();
  expect(parseHash('#/invite/a b')).toBeNull();
});
test('hash ที่ไม่รู้จัก/ว่าง/แทรกอักขระ -> null (ให้ App เลือกหน้าแรกตามบทบาท)', () => {
  expect(parseHash('')).toBeNull();
  expect(parseHash('#/nope')).toBeNull();
  expect(parseHash('#/__proto__')).toBeNull();
  expect(parseHash('#/workspace')).toBeNull();
  expect(parseHash('#/profiles/a/b')).toBeNull();
  expect(parseHash('#/profiles/<script>')).toBeNull();
});
