import { getStructure } from './structure';

test('โครงสร้างรวมวิชาและบุคลากรของทุกแผนก', async () => {
  const s = await getStructure();
  const d1 = s.find((d) => d.id === 'd1')!;
  expect(d1.subjects.length).toBeGreaterThan(0);
  expect(d1.people.some((p) => p.role === 'HEAD')).toBe(true);
  expect(s.map((d) => d.id)).toEqual(['d1', 'd2']);
});
