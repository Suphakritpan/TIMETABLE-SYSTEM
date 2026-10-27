import { acknowledge, assertAcknowledged, getRules, putRules, resetMockRules, runCheck } from './rules';
import { resetMockProfiles } from './profiles';

beforeEach(() => { resetMockProfiles(); resetMockRules(); });

test('ปวส. ปี 2 ต้องการ 38 ชม. > 30 คาบ -> problems และ acknowledge ไม่ได้ (PRECHECK_IMPOSSIBLE)', async () => {
  const r = await runCheck('p1');
  expect(r.result).toBe('problems');
  expect(r.items[0].text).toContain('ปวส. ปี 2');
  await expect(acknowledge('p1', r.id)).rejects.toMatchObject({ code: 'PRECHECK_IMPOSSIBLE' });
});

test('แก้กฎ (เพิ่มคาบต่อวัน) -> Check ผ่าน -> acknowledge -> Generate ปลดล็อก', async () => {
  expect(() => assertAcknowledged('p1')).toThrow(expect.objectContaining({ code: 'PRECHECK_NOT_ACKNOWLEDGED' }));
  await putRules('p1', { ...(await getRules('p1')), periodsPerDay: 8 });
  const r = await runCheck('p1');
  expect(r.result).toBe('ok');
  expect(() => assertAcknowledged('p1')).toThrow(); // ตรวจแล้วแต่ยังไม่รับทราบ
  const ack = await acknowledge('p1', r.id);
  expect(ack.acknowledged).toBe(true);
  expect(() => assertAcknowledged('p1')).not.toThrow();
});

test('แก้กฎหลังรับทราบ -> การรับทราบเดิมใช้ไม่ได้ ต้อง Check ใหม่', async () => {
  const rules = { ...(await getRules('p1')), periodsPerDay: 8 };
  await putRules('p1', rules);
  const r = await runCheck('p1');
  await acknowledge('p1', r.id);
  await putRules('p1', { ...rules, rooms: 5 });
  expect(() => assertAcknowledged('p1')).toThrow(expect.objectContaining({ code: 'PRECHECK_NOT_ACKNOWLEDGED' }));
  await expect(acknowledge('p1', r.id)).rejects.toMatchObject({ code: 'PRECHECK_STALE' });
});

test('กฎ hard อ่านอย่างเดียวมีให้เห็น และ soft มีน้ำหนัก', async () => {
  const rules = await getRules('p1');
  expect(rules.hard.length).toBeGreaterThan(0);
  expect(rules.soft.every((s) => s.weight >= 0 && s.weight <= 10)).toBe(true);
});
