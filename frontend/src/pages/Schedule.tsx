// ② จัดตาราง (ย้ายมาจากหน้าเว็บของเพื่อน): ข้อมูลเข้า -> ตั้งค่า -> รันสด (ตรวจก่อนจัด + แข่งหลายครั้ง) -> ตารางสัปดาห์ + เกรดทุกคาบ
// ย้ายคาบ: ลากคาบ (หรือคลิกคาบแล้วคลิกช่อง) -> ช่องที่ลงได้/ไม่ได้ขึ้นสี · ปักหมุด · ใส่ชื่อครู · ไฟล์ครู · ตารางรายครู + ตรวจคาบซ้อน
// รันสด: ขั้นตอน + ความแน่น + ผลแข่ง + บันทึกเหตุการณ์ + เล่นซ้ำ
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cancelSched, fromIngest, teacherWeek, getEvents, getSched, moveClass, moveOptions, pinClass, runSched, schedExportUrl, setTeachers, takeIngestJob, uploadSched, uploadCsv,
  type MoveOption, type SchedClass, type TeacherWeek, type SchedEvent, type SchedGrade, type SchedSettings, type SchedState, type SchedView,
} from '../api/schedule';
import CatalogSource from '../components/schedule/CatalogSource';
import TeacherFileCard from '../components/schedule/TeacherFileCard';
import { STEPS, eventText } from '../components/schedule/eventText';
import Badge, { type Tone } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { SelectField, TextField } from '../components/ui/Field';
import InlineAlert from '../components/ui/InlineAlert';
import PageHeader from '../components/ui/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import StatCard from '../components/ui/StatCard';

const GRADE: Record<SchedGrade, [Tone, string]> = { pass: ['success', 'ผ่าน'], check: ['warning', 'ลงได้ แต่มีข้อเสีย'], fix: ['error', 'ยังไม่ได้จัด/ผิด'], fixed: ['info', 'ย้ายโดยคน'] };
const LEVEL_TONE = { ok: 'success', red: 'error', amber: 'warning', person: 'info', info: 'neutral' } as const;
const ALL_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const TIMES = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const POLL_MS = 250;
const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

interface Props {
  /** ฝังในขั้น "สร้าง + จัดตาราง" ของพื้นที่ทำงานโปรไฟล์ */
  embedded?: boolean;
  year?: number;
  term?: number;
  /** ได้ผลใหม่จาก backend (จัดเสร็จ/ย้าย/ปักหมุด/ใส่ชื่อครู) */
  onView?: (v: SchedView) => void;
}

export default function Schedule({ embedded = false, year, term, onView }: Props = {}) {
  const [sid, setSid] = useState<string | null>(null);
  const [st, setSt] = useState<SchedState | null>(null);
  const [form, setForm] = useState<SchedSettings | null>(null);
  const [view, setView] = useState<SchedView | null>(null);
  const [events, setEvents] = useState<SchedEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [replayN, setReplayN] = useState<number | null>(null);
  const seen = useRef(0);
  const onViewRef = useRef(onView);
  useEffect(() => { onViewRef.current = onView; });
  const applyView = useCallback((v: SchedView) => { setView(v); onViewRef.current?.(v); }, []);

  const load = useCallback(async (id: string) => {
    const s = await getSched(id);
    setSid(id); setSt(s); setForm(s.settings); setView(s.view); setEvents([]); seen.current = 0;
  }, []);
  const open = async (start: () => Promise<{ id: string }>) => {
    setError('');
    try { await load((await start()).id); } catch (e) { setError(msg(e, 'เปิดงานจัดตารางไม่ได้')); }
  };

  // มาจากหน้า ①: เปิดงานต่อทันที
  useEffect(() => {
    const jid = takeIngestJob();
    if (jid) void fromIngest(jid).then((r) => load(r.id)).catch((e) => setError(msg(e, 'เปิดงานจัดตารางไม่ได้')));
  }, [load]);

  // poll เหตุการณ์ระหว่างรัน; เครือข่ายสะดุดแล้วถามต่อ ยกเว้น 404 (งานหาย)
  useEffect(() => {
    if (!sid || !running) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await getEvents(sid, seen.current);
        if (!live) return;
        seen.current += j.events.length;
        setEvents((xs) => [...xs, ...j.events]);
        if (j.status !== 'running') {
          setRunning(false);
          if (j.view) applyView(j.view);
          if (j.status === 'cancelled') setError('ยกเลิกแล้ว ตารางเดิม (ถ้ามี) ยังอยู่');
          else if (j.status === 'impossible') setError('จัดไม่ได้ตามการนับชั่วโมง ดูเหตุผลและวิธีแก้ในกล่อง "ตรวจก่อนจัด"');
          else if (j.error || j.status === 'error' || j.status === 'failed') setError(j.error ?? 'จัดไม่สำเร็จ');
          return;
        }
      } catch (e) {
        if (!live) return;
        setError(msg(e, 'ขาดการเชื่อมต่อ'));
        if (e instanceof Error && /ไม่พบงาน/.test(e.message)) { setRunning(false); return; }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { live = false; clearTimeout(timer); };
  }, [sid, running, applyView]);

  // เล่นซ้ำ: ไล่เหตุการณ์ที่บันทึกไว้ทีละรายการ (ช้าลงให้ดูทัน)
  useEffect(() => {
    if (replayN === null || replayN >= events.length) return;
    const wait = Math.min(1400, Math.max(450, 16000 / events.length));
    const t = setTimeout(() => setReplayN(replayN + 1), wait);
    return () => clearTimeout(t);
  }, [replayN, events.length]);

  const replaying = replayN !== null && replayN < events.length;

  const start = async () => {
    if (!sid || !form) return;
    setReplayN(null);
    setError(''); setEvents([]); seen.current = 0;
    try { await runSched(sid, form); setRunning(true); } catch (e) { setError(msg(e, 'เริ่มจัดไม่ได้')); }
  };

  if (!sid || !st || !form) {
    return (
      <>
        {!embedded && <PageHeader title="จัดตาราง" subtitle="รับรายวิชาจากหน้า “อ่านหลักสูตร” หรือเลือกจากหลักสูตรในระบบ หรืออัปโหลดไฟล์ (JSON / CSV)" />}
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <Card title="เลือกจากหลักสูตรในระบบ">
          <CatalogSource defaultYear={year} defaultTerm={term} onOpen={(csv, name) => void open(() => uploadCsv(csv, name))} />
        </Card>
        <Card title="หรือเริ่มจากไฟล์">
          <div className="field">
            <label htmlFor="sched-file">ไฟล์ JSON / CSV ที่ส่งออกจากหน้าอ่านหลักสูตร</label>
            <input id="sched-file" type="file" className="input" accept=".json,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(() => uploadSched(f)); }} />
          </div>
          <p className="muted">ไฟล์ต้นแบบอยู่ที่ <a href="/template.csv" download>template.csv</a></p>
        </Card>
      </>
    );
  }

  const set = <K extends keyof SchedSettings>(k: K, v: SchedSettings[K]) => setForm({ ...form, [k]: v });
  const num = (k: 'term' | 'groups' | 'students' | 'lecture_rooms' | 'lab_rooms' | 'candidates') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k, Number(e.target.value));
  const list = st.kind === 'course_list';

  return (
    <>
      {embedded ? <p className="muted">{st.source} · {st.input.rows} {list ? 'วิชา' : 'แถว'}</p> : <PageHeader title="จัดตาราง" subtitle={`${st.source} · ${st.input.rows} ${list ? 'วิชา' : 'แถว'}`} actions={<Button onClick={() => { setSid(null); setSt(null); setView(null); setEvents([]); setError(''); }} disabled={running}>เปลี่ยนไฟล์</Button>} />}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {st.input.fix.length > 0 && (
        <InlineAlert tone="warning">
          {st.input.fix.length} แถวที่หน้าอ่านหลักสูตรยังให้ “ต้องแก้” จะไม่ถูกจัด (ติ๊ก “จัดแถวที่ต้องแก้ด้วย” เพื่อบังคับจัด): {st.input.fix.map((x) => `${x.code} ${x.name_th ?? ''}`).join(' · ')}
        </InlineAlert>
      )}
      {st.issues.length > 0 && <InlineAlert tone="warning">{st.issues.map((i, n) => <div key={n}>{i.th}</div>)}</InlineAlert>}

      <Card title="ตั้งค่าการจัด">
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <SelectField label="ภาคเรียน" value={form.term} onChange={num('term')}>
            {(st.terms.length ? st.terms : [1, 2, 3]).map((t) => <option key={t} value={t}>{t === 3 ? 'ฤดูร้อน' : `ภาค ${t}`}</option>)}
          </SelectField>
          <TextField label="จำนวนกลุ่มเรียน" type="number" min={1} max={10} value={form.groups} onChange={num('groups')} />
          <TextField label="นักเรียนต่อกลุ่ม" type="number" min={1} max={500} value={form.students} onChange={num('students')} />
          <TextField label="ห้องบรรยาย" type="number" min={1} max={60} value={form.lecture_rooms} onChange={num('lecture_rooms')} />
          <TextField label="ห้องปฏิบัติการ" type="number" min={0} max={60} value={form.lab_rooms} onChange={num('lab_rooms')} />
          <SelectField label="คาบแรกเริ่ม" value={form.first} onChange={(e) => set('first', e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</SelectField>
          <SelectField label="คาบสุดท้ายเริ่ม" value={form.last} onChange={(e) => set('last', e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</SelectField>
          <SelectField label="พักกลางวัน" value={form.lunch} onChange={(e) => set('lunch', e.target.value as SchedSettings['lunch'])}>
            <option value="flexible">ยืดหยุ่น (11–12 หรือ 12–13)</option><option value="fixed">ตายตัว 12–13</option>
          </SelectField>
          <TextField label="ลองจัดกี่ครั้ง" type="number" min={1} max={10} value={form.candidates} onChange={num('candidates')} />
        </form>
        <fieldset className="field">
          <legend>วันเรียน</legend>
          <div className="actions">
            {ALL_DAYS.map((d) => (
              <label key={d}><input type="checkbox" checked={form.days.includes(d)} onChange={(e) => set('days', e.target.checked ? ALL_DAYS.filter((x) => x === d || form.days.includes(x)) : form.days.filter((x) => x !== d))} /> {d}</label>
            ))}
          </div>
        </fieldset>
        <label><input type="checkbox" checked={form.flag} onChange={(e) => set('flag', e.target.checked)} /> กิจกรรมหน้าเสาธง 07:30</label>{' '}
        <label><input type="checkbox" checked={form.include_fix} onChange={(e) => set('include_fix', e.target.checked)} /> จัดแถวที่ต้องแก้ด้วย</label>
        {list && (
          <fieldset className="field">
            <legend>เลือกวิชาที่จะจัดในภาคนี้ ({form.codes.length} วิชา)</legend>
            <ul className="plain codes">
              {st.input.subjects.map((s) => (
                <li key={s.code}><label>
                  <input type="checkbox" checked={form.codes.includes(s.code)} onChange={(e) => set('codes', e.target.checked ? [...form.codes, s.code] : form.codes.filter((c) => c !== s.code))} />
                  {' '}{s.code} {s.name_th} <span className="muted">ท.{s.lecture ?? '?'} ป.{s.lab ?? '?'} นก.{s.credits ?? '?'}</span>
                </label></li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="actions">
          <Button variant="primary" loading={running} disabled={form.days.length === 0} onClick={() => void start()}>{view ? 'จัดใหม่ (คงคาบที่ปักหมุด)' : 'จัดตาราง'}</Button>
          {running && <Button variant="destructive" onClick={() => void cancelSched(sid).catch((e) => setError(msg(e, 'ยกเลิกไม่ได้')))}>ยกเลิก</Button>}
        </div>
      </Card>

      <TeacherFileCard sid={sid} file={st.teacher_file} onChange={(f) => setSt({ ...st, teacher_file: f })} onError={setError} />

      {events.length > 0 && (
        <Live events={replaying ? events.slice(0, replayN) : events}
          action={replaying ? <Button onClick={() => setReplayN(null)}>ข้าม</Button> : !running ? <Button onClick={() => setReplayN(0)}>เล่นซ้ำ</Button> : undefined} />
      )}
      {view && <Result sid={sid} view={view} setView={applyView} onError={setError} />}
    </>
  );
}

function Live({ events, action }: { events: SchedEvent[]; action?: ReactNode }) {
  const stages: Record<string, 'run' | 'done'> = {};
  const race: Record<number, SchedEvent> = {};
  let pre: SchedEvent | undefined;
  let best: number | undefined;
  for (const e of events) {
    if (e.event === 'stage' && e.name) {
      stages[e.name] = e.state === 'start' ? 'run' : 'done';
      if (e.name === 'precheck' && e.state !== 'start') pre = e;
      if (e.name === 'score' && e.best !== undefined) best = e.best;
    } else if (e.event === 'candidate' && e.seed !== undefined) race[e.seed] = e;
  }
  const tight = pre?.tightness;
  return (
    <Card title="กำลังจัด" actions={action}>
      <ol className="steps" aria-label="ขั้นตอนการจัด">
        {STEPS.map(([k, name]) => <li key={k}><Badge tone={stages[k] === 'done' ? 'success' : stages[k] === 'run' ? 'info' : 'neutral'}>{name}{stages[k] === 'run' ? ' …' : ''}</Badge></li>)}
      </ol>
      {tight !== undefined && (
        <>
          <p>ความแน่นของตาราง {Math.round(tight * 100)}% {tight > 1 ? '(เกินความจุ: จัดไม่ได้)' : tight > 0.85 ? '(แน่นมาก)' : ''}</p>
          <ProgressBar value={Math.min(100, tight * 100)} label="ความแน่นของตาราง" />
          {pre?.problems && pre.problems.length > 0 && <ul>{pre.problems.map((p, i) => <li key={i}>{p.what} → <strong>{p.fix}</strong></li>)}</ul>}
        </>
      )}
      {Object.keys(race).length > 0 && (
        <ul className="plain" aria-label="ผลการลองจัดแต่ละครั้ง">
          {Object.entries(race).map(([seed, c]) => (
            <li key={seed}>
              ครั้งที่ {seed}{Number(seed) === best ? ' 🏆' : ''}:{' '}
              {c.state === 'start' ? 'กำลังลอง…' : `${c.status === 'solved' ? `${c.quality} คะแนน` : c.status} · วางได้ ${c.placed}/${c.of}${c.breaks ? ` · ผิดกฎ ${c.breaks}` : ''}`}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>บันทึกเหตุการณ์ ({events.length})</summary>
        <ol className="log" aria-label="บันทึกเหตุการณ์">
          {events.map((e) => <li key={e.n}>{e.t.toFixed(3)} วิ · {eventText(e)}</li>)}
        </ol>
      </details>
    </Card>
  );
}

function Result({ sid, view, setView, onError }: { sid: string; view: SchedView; setView: (v: SchedView) => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<'group' | 'room' | 'teacher'>('group');
  const [pick, setPick] = useState('');
  const [teacher, setTeacher] = useState<TeacherWeek | null>(null);
  const [tname, setTname] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [options, setOptions] = useState<MoveOption[] | null>(null);
  const [filter, setFilter] = useState<SchedGrade | 'all'>('all');
  const [names, setNames] = useState('');

  const teacherNames = [...new Set(view.classes.flatMap((c) => c.teachers))];
  const loadTeacher = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    try { setTeacher(await teacherWeek(sid, n)); } catch (e) { onError(msg(e, 'ดูตารางครูไม่ได้')); }
  };
  const openTeacher = (name: string) => { setMode('teacher'); setTname(name); void loadTeacher(name); };
  const clash = new Set(teacher?.clashes.flatMap((c) => [c.a, c.b]) ?? []);
  const choices = mode === 'group' ? view.groups : mode === 'room' ? view.rooms.map((r) => r.name) : [];
  const cur = choices.includes(pick) ? pick : (choices[0] ?? '');
  const sel = view.classes.find((c) => c.key === selected) ?? null;
  const s = view.summary;

  const choose = async (c: SchedClass | null) => {
    setSelected(c?.key ?? null); setOptions(null); setNames(c?.teachers.join(', ') ?? '');
    if (!c) return;
    try { setOptions(await moveOptions(sid, c.key)); } catch (e) { onError(msg(e, 'ดูช่องที่ย้ายได้ไม่ได้')); }
  };
  const act = async (p: Promise<SchedView>) => {
    try { setView(await p); setOptions(null); if (teacher) await loadTeacher(teacher.name); } catch (e) { onError(msg(e, 'ทำรายการไม่สำเร็จ')); }
  };
  const toCell = (day: string, hour: string) => {
    const o = options?.find((x) => x.day === day && x.hour === hour);
    if (!sel || !o) return;
    if (!o.ok) return onError(`ย้ายไม่ได้: ${o.why ?? ''}`);
    onError('');
    void act(moveClass(sid, sel.key, day, hour)).then(() => setSelected(sel.key));
  };

  const shown = mode === 'teacher' ? (teacher?.classes ?? []) : view.classes.filter((c) => c.day && (mode === 'group' ? c.groups.includes(cur) : c.room === cur));
  const tray = view.classes.filter((c) => !c.day);
  const flag = view.flag ? 1 : 0;
  const shownKey = (c: SchedClass) => `${c.key}`;

  return (
    <>
      <div className="stats">
        <StatCard label="คาบที่จัดได้" value={`${s.placed}/${s.classes}`} tone="info" />
        <StatCard label="ผิดกฎบังคับ" value={s.hard_breaks} tone={s.hard_breaks ? 'error' : 'success'} hint="ตัวตรวจของเรา" />
        <StatCard label="คะแนนคุณภาพ" value={s.quality ?? '-'} hint="เต็ม 100" />
        {(['pass', 'check', 'fix', 'fixed'] as SchedGrade[]).map((g) => (s[g] || g !== 'fixed') && <StatCard key={g} label={GRADE[g][1]} value={s[g]} tone={GRADE[g][0]} />)}
      </div>
      {view.breaks.length > 0 && <InlineAlert tone="error">{view.breaks.map((b, i) => <div key={i}>{b}</div>)}</InlineAlert>}

      <Card title="ตารางสัปดาห์" actions={<>
        <a className="btn btn-secondary" href={schedExportUrl(sid, 'json')} download>ส่งออก JSON</a>
        <a className="btn btn-secondary" href={schedExportUrl(sid, 'csv')} download>ส่งออก CSV</a>
      </>}>
        <div className="actions" role="group" aria-label="มุมมอง">
          <Button variant={mode === 'group' ? 'primary' : 'secondary'} aria-pressed={mode === 'group'} onClick={() => setMode('group')}>ตามกลุ่มเรียน</Button>
          <Button variant={mode === 'room' ? 'primary' : 'secondary'} aria-pressed={mode === 'room'} onClick={() => setMode('room')}>ตามห้อง</Button>
          <Button variant={mode === 'teacher' ? 'primary' : 'secondary'} aria-pressed={mode === 'teacher'} onClick={() => setMode('teacher')}>ตามครู</Button>
          {mode === 'teacher' ? (
            <form className="actions" onSubmit={(e) => { e.preventDefault(); void loadTeacher(tname); }}>
              <input className="input" aria-label="ชื่อครู" list="teacher-names" value={tname} onChange={(e) => setTname(e.target.value)} placeholder="พิมพ์ชื่อครู" />
              <datalist id="teacher-names">{teacherNames.map((n) => <option key={n} value={n} />)}</datalist>
              <Button type="submit">ดูตาราง</Button>
            </form>
          ) : (
            <select className="input" aria-label={mode === 'group' ? 'เลือกกลุ่ม' : 'เลือกห้อง'} value={cur} onChange={(e) => setPick(e.target.value)}>
              {choices.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
        {mode === 'teacher' && teacher && (teacher.clashes.length > 0
          ? <InlineAlert tone="error">ครู{teacher.name} มีคาบซ้อน {teacher.clashes.length} ครั้ง: {teacher.clashes.map((c) => c.th).join(' · ')} — ลากย้ายคาบใดคาบหนึ่ง หรือกด “จัดใหม่” ระบบจะแยกเวลาครูที่ใส่ชื่อแล้วให้</InlineAlert>
          : <InlineAlert tone="success">ครู{teacher.name}: {teacher.classes.length} คาบ {teacher.hours} ชม./สัปดาห์ · ไม่มีคาบซ้อน</InlineAlert>)}
        <p className="muted">{sel ? `เลือก ${sel.code} อยู่: คลิกช่องสีเขียวเพื่อย้าย (คลิกคาบเดิมอีกครั้งเพื่อยกเลิก)` : 'คลิกคาบเพื่อดูเหตุผล ย้าย หรือปักหมุด'}</p>
        <div className="wk-scroll">
          <div className="wk" style={{ gridTemplateColumns: `76px ${flag ? '34px ' : ''}repeat(${view.hours.length}, minmax(76px, 1fr))` }}>
            <div className="wk-hd" style={{ gridRow: 1, gridColumn: 1 }}>วัน</div>
            {flag === 1 && <div className="wk-hd" style={{ gridRow: 1, gridColumn: 2 }}>07:30</div>}
            {view.hours.map((h, i) => <div key={h} className="wk-hd" style={{ gridRow: 1, gridColumn: i + 2 + flag }}>{i + 1}<br />{h}</div>)}
            {view.days.map((d, r) => (
              <div key={d} className="wk-day" style={{ gridRow: r + 2, gridColumn: 1 }}>{d}</div>
            ))}
            {view.days.flatMap((d, r) => view.hours.map((h, i) => {
              const o = options?.find((x) => x.day === d && x.hour === h);
              return (
                <button key={`${d}${h}`} type="button" className={`wk-cell${o ? (o.ok ? ' ok' : ' bad') : ''}`} style={{ gridRow: r + 2, gridColumn: i + 2 + flag }}
                  aria-label={`${d} ${h}${o ? (o.ok ? ' ลงได้' : ` ลงไม่ได้: ${o.why ?? ''}`) : ''}`} title={o ? (o.ok ? `ลงได้ · ห้อง ${o.room ?? '-'}` : o.why) : undefined}
                  aria-disabled={!o} onClick={() => toCell(d, h)}
                  onDragOver={(e) => { if (o) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); toCell(d, h); }} />
              );
            }))}
            {flag === 1 && <div className="wk-flag" style={{ gridRow: `2 / span ${view.days.length}`, gridColumn: 2 }}>กิจกรรมหน้าเสาธง</div>}
            {mode === 'group' && view.lunch.filter((l) => l.group === cur).map((l) => (
              <div key={l.key} className="wk-lunch" style={{ gridRow: view.days.indexOf(l.day) + 2, gridColumn: view.hours.indexOf(l.hour) + 2 + flag }}>พัก</div>
            ))}
            {shown.map((c) => (
              <button key={shownKey(c)} type="button" className={`wk-card k-${c.kind} g-${c.grade}${selected === c.key ? ' sel' : ''}${clash.has(c.key) ? ' clash' : ''}`} onClick={() => void choose(selected === c.key ? null : c)}
                draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.key); void choose(c); }}
                style={{ gridRow: view.days.indexOf(c.day as string) + 2, gridColumn: `${view.hours.indexOf(c.hour as string) + 2 + flag} / span ${c.hours}` }}
                title={`${c.name_th} · ${c.reasons.map((r) => r.th).join(' · ')}`}>
                <strong>{c.pinned ? '📌 ' : ''}{c.code}</strong><span>{c.room ?? ''}</span>{mode === 'room' && <span>{c.students_set}</span>}{c.teachers.length > 0 && <span>{c.teachers.join(', ')}</span>}
              </button>
            ))}
          </div>
        </div>
        {tray.length > 0 && (
          <div className="wk-tray">
            <strong>ยังไม่ได้จัด ({tray.length}) — คลิกเพื่อเลือก แล้วคลิกช่องที่ลงได้</strong>
            <div className="actions">{tray.map((c) => <Button key={c.key} variant={selected === c.key ? 'primary' : 'secondary'} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.key); void choose(c); }} onClick={() => void choose(selected === c.key ? null : c)}>{c.code}</Button>)}</div>
          </div>
        )}
      </Card>

      {sel && (
        <Card title={`${sel.code} ${sel.name_th}`}>
          <p><Badge tone={GRADE[sel.grade][0]}>{GRADE[sel.grade][1]}</Badge> <span className="muted">{sel.kind_th} · {sel.hours} ชม. · {sel.students_set} ({sel.students} คน) · {sel.day ? `${sel.day} ${sel.hour} · ${sel.room ?? 'ไม่ใช้ห้อง'}` : 'ยังไม่ได้จัด'}</span></p>
          <ul className="plain">{sel.reasons.map((r, i) => <li key={i}><Badge tone={LEVEL_TONE[r.level]}>{r.th}</Badge></li>)}</ul>
          <form className="form-row" onSubmit={(e) => { e.preventDefault(); void act(setTeachers(sid, sel.key, names.split(',').map((x) => x.trim()).filter(Boolean))); }}>
            <TextField label="ครูผู้สอน (คั่นด้วย ,)" value={names} onChange={(e) => setNames(e.target.value)} />
            <Button type="submit">บันทึกชื่อครู</Button>
            {sel.day && <Button onClick={() => void act(pinClass(sid, sel.key, !sel.pinned))}>{sel.pinned ? 'เลิกปักหมุด' : '📌 ปักหมุด (จัดใหม่แล้วไม่ย้าย)'}</Button>}
          </form>
        </Card>
      )}

      <Card title="เกรดทุกคาบ">
        <div className="actions" role="group" aria-label="กรองตามเกรด">
          {(['all', 'fix', 'check', 'fixed', 'pass'] as const).filter((g) => g === 'all' || s[g]).map((g) => (
            <Button key={g} variant={filter === g ? 'primary' : 'secondary'} aria-pressed={filter === g} onClick={() => setFilter(g)}>{g === 'all' ? 'ทั้งหมด' : GRADE[g][1]} ({g === 'all' ? s.classes : s[g]})</Button>
          ))}
        </div>
        <table className="dt">
          <thead><tr><th>เกรด</th><th>รหัส</th><th>ชื่อวิชา</th><th>ประเภท</th><th>กลุ่ม</th><th>เวลา</th><th>ห้อง</th><th>เหตุผล</th></tr></thead>
          <tbody>
            {view.classes.filter((c) => filter === 'all' || c.grade === filter).map((c) => (
              <tr key={c.key}>
                <td><Badge tone={GRADE[c.grade][0]}>{GRADE[c.grade][1]}</Badge>{c.pinned ? ' 📌' : ''}</td>
                <td><Button variant="tertiary" onClick={() => void choose(c)}>{c.code}</Button></td>
                <td>{c.name_th}</td><td>{c.kind_th} {c.hours} ชม.</td><td>{c.students_set}</td>
                <td>{c.day ? `${c.day} ${c.hour}` : '-'}</td><td>{c.room ?? '-'}</td>
                <td><ul className="plain">{c.reasons.map((r, i) => <li key={i}><Badge tone={LEVEL_TONE[r.level]}>{r.th}</Badge></li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="ตัวชี้วัด">
        <h3>กลุ่มเรียน</h3>
        <table className="dt"><thead><tr><th>กลุ่ม</th><th>เรียน (ชม.)</th><th>ว่าง</th><th>คาบว่างระหว่างวัน</th><th>วันเรียน</th></tr></thead>
          <tbody>{view.indicators.groups.map((g) => <tr key={g.group}><td>{g.group}</td><td>{g.class_hours}</td><td>{g.free}</td><td>{g.gaps}</td><td>{g.days}</td></tr>)}</tbody></table>
        <h3>การใช้ห้อง</h3>
        <ul className="plain">{view.indicators.rooms.slice().sort((a, b) => b.pct - a.pct).map((r) => <li key={r.name}>{r.name} <ProgressBar value={r.pct} label={`ห้อง ${r.name} ใช้ ${r.pct}%`} /> {r.pct}%</li>)}</ul>
        {view.indicators.teachers.length > 0 && (
          <>
            <h3>ครู</h3>
            <table className="dt"><thead><tr><th>ครู</th><th>ชม./สัปดาห์</th><th>วัน</th><th>มากสุด/วัน</th></tr></thead>
              <tbody>{view.indicators.teachers.map((t) => <tr key={t.teacher}><td><Button variant="tertiary" onClick={() => openTeacher(t.teacher)}>{t.teacher}</Button></td><td>{t.hours}</td><td>{t.days}</td><td>{t.max_day}</td></tr>)}</tbody></table>
          </>
        )}
      </Card>
    </>
  );
}
