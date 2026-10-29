import { cellKey, defaultSettings, periodTimes, saveSettings, teachDays } from './setup';

test('ค่าตั้งต้นสอนจันทร์–ศุกร์ และคำนวณเวลาแต่ละคาบต่อเนื่อง', () => {
  const s = defaultSettings();
  expect(teachDays(s)).toBe(5);
  expect(s.grid[cellKey(0, 5)]).toBe('break');
  const t = periodTimes(s);
  expect(t[0]).toEqual({ no: 1, from: '08:00', to: '09:00' });
  expect(t[4].from).toBe('12:00');
});

test('บันทึกไม่ได้ถ้าค่าไม่ถูกต้องหรือไม่มีคาบสอนเลย', async () => {
  await expect(saveSettings('yp1', { ...defaultSettings(), periods: 20 })).rejects.toThrow('1–12');
  await expect(saveSettings('yp1', { ...defaultSettings(), grid: {} })).rejects.toThrow('อย่างน้อย 1 คาบ');
});
