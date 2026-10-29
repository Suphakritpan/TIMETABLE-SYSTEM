import { getCatalog, getStructure } from './structure';

test('บุคลากรรวมทุกแผน', async () => {
  const s = await getStructure();
  expect(s.map((d) => d.id)).toEqual(['d1', 'd2']);
  expect(s[0].people.some((p) => p.role === 'HEAD')).toBe(true);
});

test('แค็ตตาล็อกหลักสูตร: ทุกวิชามีชื่อ/รหัส และหลักสูตรชลบุรีแยกเป็นแผนกตามรหัสวิชาชีพ', async () => {
  const cat = await getCatalog();
  const cb = cat.find((i) => i.id === 'chonburi')!;
  expect(cb.departments.length).toBeGreaterThan(5);
  const all = cat.flatMap((i) => i.departments.flatMap((d) => d.curricula.flatMap((p) => p.courses)));
  expect(all.every((c) => c.code && c.name)).toBe(true);
  expect(cb.departments[0].curricula[0].year).toBe(2568);
});
