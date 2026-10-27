import { findClashes } from './clashes';
import type { ClassItem } from '../types';

const c = (id: string, over: Partial<ClassItem>): ClassItem => ({
  id, day: 0, start: 1, span: 2, code: `ท.${id}`, name: 'วิชา', room: `R${id}`, teacher: `ครู${id}`, status: 'ok', ...over,
});

test('ไม่ซ้อนกัน = ไม่ชน (ติดกันพอดีไม่นับ)', () => {
  expect(findClashes([c('a', {}), c('b', { start: 3 })]).size).toBe(0);
  expect(findClashes([c('a', {}), c('b', { day: 1 })]).size).toBe(0);
});

test('ครูคนเดียวกันเวลาทับกัน -> ชนทั้งสองช่อง พร้อมชื่อครู', () => {
  const m = findClashes([c('a', { teacher: 'ไมตรี' }), c('b', { start: 2, teacher: 'ไมตรี' })]);
  expect(m.get('a')).toEqual(['ครู ไมตรี ซ้อนกับ ท.b']);
  expect(m.get('b')).toEqual(['ครู ไมตรี ซ้อนกับ ท.a']);
});

test('ห้องเดียวกันเวลาทับกัน -> ชน', () => {
  const m = findClashes([c('a', { room: 'COM602' }), c('b', { room: 'COM602' })]);
  expect(m.get('a')?.[0]).toContain('ห้อง COM602');
});

test('ครูร่วม (a + b): ชนเมื่อมีครูคนใดคนหนึ่งซ้ำ', () => {
  const m = findClashes([c('a', { teacher: 'ลี + ธัญญาเรศ' }), c('b', { teacher: 'ธัญญาเรศ' })]);
  expect(m.get('a')).toEqual(['ครู ธัญญาเรศ ซ้อนกับ ท.b']);
});

test('ซ้ำทั้งครูและห้อง -> มีสองเหตุผล', () => {
  const m = findClashes([c('a', { teacher: 'ก', room: 'R' }), c('b', { teacher: 'ก', room: 'R' })]);
  expect(m.get('a')).toHaveLength(2);
});
