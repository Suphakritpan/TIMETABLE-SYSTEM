import { term } from './terminology';

test('อาชีวะเรียก แผนกวิชา/ครู', () => {
  expect(term('vocational', 'department')).toBe('แผนกวิชา');
  expect(term('vocational', 'teacher')).toBe('ครู');
});
test('ประเภทที่ไม่รู้จักตกไปใช้อาชีวะ', () => expect(term('x' as never, 'department')).toBe('แผนกวิชา'));
test('มหาวิทยาลัยเรียก ภาควิชา/อาจารย์', () => expect(term('university', 'teacher')).toBe('อาจารย์'));
