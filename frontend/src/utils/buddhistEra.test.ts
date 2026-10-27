import { termLabel, toBE } from './buddhistEra';

test('ค.ศ. -> พ.ศ. ในป้ายภาคเรียน', () => {
  expect(termLabel({ no: 1, year_ce: 2027 })).toBe('1/2570');
  expect(toBE(2026)).toBe(2569);
});
