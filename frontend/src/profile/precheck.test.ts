import { runPrecheck, type RulesState } from './precheck';

const rules = (over: Partial<RulesState> = {}): RulesState => ({
  periodsPerDay: 6, days: 5, rooms: 3,
  hard: [{ key: 'h1', label: 'ห้องปฏิบัติการสำหรับวิชาปฏิบัติ' }],
  soft: [{ key: 'no_gaps', label: 'ลดคาบว่างระหว่างวัน', enabled: true, weight: 5 }],
  ...over,
});

test('ผ่านทุกอย่าง -> ok ไม่มีรายการ', () => {
  expect(runPrecheck(rules(), [{ label: 'ปวส. ปี 1', hoursPerWeek: 26 }])).toEqual({ result: 'ok', items: [] });
});

test('ชั่วโมงเกินคาบในสัปดาห์ -> problems พร้อมเหตุผลและวิธีแก้ (ตัวอย่างในเอกสาร: 38 ชม. สัปดาห์มี 30)', () => {
  const r = runPrecheck(rules(), [{ label: 'ปวส. ปี 2', hoursPerWeek: 38 }]);
  expect(r.result).toBe('problems');
  expect(r.items[0].text).toBe('ปวส. ปี 2 ต้องการ 38 ชม./สัปดาห์ แต่สัปดาห์มี 30 คาบ');
  expect(r.items[0].fix).toContain('อย่างน้อย 8 คาบ');
});

test('ไม่มีห้อง -> problems', () => {
  const r = runPrecheck(rules({ rooms: 0 }), []);
  expect(r.result).toBe('problems');
  expect(r.items[0].fix).toContain('จำนวนห้อง');
});

test('กฎ soft น้ำหนักสูง -> risky เฉพาะที่เปิดอยู่', () => {
  const high = { key: 'k', label: 'ลดคาบว่าง', enabled: true, weight: 9 };
  expect(runPrecheck(rules({ soft: [high] }), []).result).toBe('risky');
  expect(runPrecheck(rules({ soft: [{ ...high, enabled: false }] }), []).result).toBe('ok');
  expect(runPrecheck(rules({ soft: [{ ...high, weight: 7 }] }), []).result).toBe('ok');
});

test('มีทั้งปัญหาและความเสี่ยง -> problems (ปัญหาชนะ)', () => {
  const r = runPrecheck(rules({ rooms: 0, soft: [{ key: 'k', label: 'x', enabled: true, weight: 10 }] }), []);
  expect(r.result).toBe('problems');
  expect(r.items).toHaveLength(2);
});
