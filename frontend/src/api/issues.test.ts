import { OUTCOMES, addComment, assertIssuesComplete, decide, listIssues, myIssues, resetMockIssues, setIssuesClock } from './issues';

beforeEach(() => { resetMockIssues(); setIssuesClock(() => 1_800_000_000_000); });

test('ระบบสร้างรายการเอง: มีทั้ง BLOCKER และ WARNING, กรองได้', async () => {
  const all = await listIssues('p1');
  expect(all.map((i) => i.severity)).toEqual(['BLOCKER', 'BLOCKER', 'WARNING']);
  expect((await listIssues('p1', { severity: 'WARNING' }))).toHaveLength(1);
  expect((await listIssues('p1', { state: 'closed' }))).toHaveLength(0);
});

test('เธรดความเห็นเดียวกันสองฝั่ง: ครูตอบแล้วหัวหน้าเห็น; ข้อความว่างถูกปฏิเสธ', async () => {
  const [, about] = await listIssues('p1');
  await addComment(about.id, { id: 'u-head', name: 'หัวหน้า' }, 'ช่วยตรวจชั่วโมงสอนวันพฤหัส');
  await addComment(about.id, { id: 'u-teacher', name: 'ครู' }, '  ตั้งไว้ผิด ขอแก้เป็น 8 ชม.  ');
  await expect(addComment(about.id, { id: 'u-teacher', name: 'ครู' }, '   ')).rejects.toMatchObject({ code: 'VALIDATION' });
  const headView = (await listIssues('p1'))[1];
  const teacherView = (await myIssues('u-teacher', ['p1'])).find((i) => i.id === about.id)!;
  expect(headView.comments.map((c) => c.body)).toEqual(['ช่วยตรวจชั่วโมงสอนวันพฤหัส', 'ตั้งไว้ผิด ขอแก้เป็น 8 ชม.']);
  expect(teacherView.comments).toEqual(headView.comments);
});

test('myIssues: เฉพาะรายการที่เกี่ยวกับฉัน', async () => {
  const mine = await myIssues('u-teacher', ['p1']);
  expect(mine.map((i) => i.kind).sort()).toEqual(['LOW_RANK', 'OVER_LIMIT']);
  expect(await myIssues('คนอื่น', ['p1'])).toHaveLength(0);
});

test('BLOCKER ยอมรับเฉย ๆ ไม่ได้ (BLOCKER_NOT_ACCEPTABLE) ต้องเลือกวิธีแก้', async () => {
  const [blocker] = await listIssues('p1');
  await expect(decide(blocker.id, 'u-head', { outcome: 'accept', note: 'ไม่เป็นไร' })).rejects.toMatchObject({ code: 'BLOCKER_NOT_ACCEPTABLE' });
  expect(OUTCOMES.BLOCKER).not.toContain('accept');
});

test('ตัดสินใจต้องมีหมายเหตุ; บันทึก ใคร/เมื่อไหร่/ทำไม; ตัดสินซ้ำไม่ได้', async () => {
  const [blocker] = await listIssues('p1');
  await expect(decide(blocker.id, 'u-head', { outcome: 'assign', note: ' ' })).rejects.toMatchObject({ code: 'VALIDATION' });
  const closed = await decide(blocker.id, 'u-head', { outcome: 'outside_teacher', note: 'จ้างครูพิเศษ' });
  expect(closed.state).toBe('closed');
  expect(closed.decision).toEqual({ outcome: 'outside_teacher', note: 'จ้างครูพิเศษ', decided_by: 'u-head', decided_at: 1_800_000_000_000 });
  await expect(decide(blocker.id, 'u-head', { outcome: 'assign', note: 'x' })).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
});

test('WARNING ยอมรับพร้อมหมายเหตุได้', async () => {
  const w = (await listIssues('p1', { severity: 'WARNING' }))[0];
  expect((await decide(w.id, 'u-head', { outcome: 'accept', note: 'ครูรับทราบแล้ว' })).state).toBe('closed');
  await expect(decide((await listIssues('p1'))[0].id, 'u-head', { outcome: 'assign' as never, note: 'x' })).resolves.toBeDefined();
});

test('ขั้น 4 ไปต่อไม่ได้จนกว่าจะตัดสินครบ (ISSUES_UNDECIDED พร้อมจำนวน)', async () => {
  await expect(assertIssuesComplete('p1')).rejects.toMatchObject({ code: 'ISSUES_UNDECIDED', message: 'ยังมี 3 รายการที่ยังไม่ตัดสินใจ' });
  for (const i of await listIssues('p1')) await decide(i.id, 'u-head', { outcome: i.severity === 'WARNING' ? 'accept' : 'change', note: 'แก้แล้ว' });
  await expect(assertIssuesComplete('p1')).resolves.toBeUndefined();
});
