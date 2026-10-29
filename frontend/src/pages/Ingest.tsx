// ① อ่านหลักสูตร: อัปโหลด -> ดูขั้นตอนสด -> ทุกวิชามีเกรด+เหตุผล -> แก้ค่าที่อ่านผิดได้ (backend/ ของเพื่อน)
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiException } from '../api/types';
import { FormatRace, PageMap } from '../components/schedule/IngestLive';
import { rememberIngestJob } from '../api/schedule';
import {
  cancelJob, cropUrl, exportUrl, fixRow, getJob, listSamples, startRead, startSample,
  type Grade, type IngestEvent, type IngestJob, type IngestResult, type IngestRow, type RowFix, type Sample,
} from '../api/ingest';
import Badge, { type Tone } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import InlineAlert from '../components/ui/InlineAlert';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { TextField } from '../components/ui/Field';

const STEPS: [string, string][] = [
  ['check', 'ตรวจไฟล์'], ['office', 'แปลงไฟล์ Office'], ['text', 'ดึงข้อความ'], ['ocr', 'OCR'],
  ['format', 'เลือกรูปแบบ'], ['reread', 'อ่านซ้ำค่าที่สงสัย'], ['rows', 'อ่านรายวิชา'], ['grade', 'ให้เกรด'],
];
const GRADE: Record<Grade, [Tone, string]> = {
  pass: ['success', 'ผ่าน'], check: ['warning', 'ตรวจดู'], fix: ['error', 'ต้องแก้'], unknown: ['neutral', 'กำหนดภายหลัง'], fixed: ['info', 'แก้โดยคน'],
};
const LEVEL_TONE = { ok: 'success', red: 'error', amber: 'warning', person: 'info', info: 'neutral' } as const;
const POLL_MS = 500;
// งานที่กำลังอ่าน/อ่านเสร็จจำไว้ในเบราว์เซอร์ กด reload แล้วกลับมาดูต่อได้ (งานอยู่ที่ backend ไม่ใช่ในหน้านี้)
const JOB_KEY = 'ingest.job';
const savedJob = (): string | null => { try { return localStorage.getItem(JOB_KEY); } catch { return null; } };
const saveJob = (id: string | null) => { try { if (id) localStorage.setItem(JOB_KEY, id); else localStorage.removeItem(JOB_KEY); } catch { /* ไม่มีที่เก็บ: ใช้ได้แต่ reload แล้วเริ่มใหม่ */ } };

function SectionHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-header"><div><h3>{title}</h3>{subtitle && <p className="muted">{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

/** ขั้นตอนที่เริ่ม/เสร็จแล้ว จาก event ชนิด stage */
function stageState(events: IngestEvent[]): Record<string, 'run' | 'done'> {
  const s: Record<string, 'run' | 'done'> = {};
  for (const e of events) if (e.event === 'stage') s[String(e.name)] = e.state === 'start' ? 'run' : 'done';
  return s;
}

/** embedded = อยู่ในขั้น "ตรวจข้อมูล" ของพื้นที่ทำงานโปรไฟล์ (ไม่ใช้ h1 ซ้ำ) */
export default function Ingest({ embedded = false, onSchedule }: { embedded?: boolean; onSchedule?: () => void } = {}) {
  const Head = embedded ? SectionHead : PageHeader;
  const [samples, setSamples] = useState<Sample[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(savedJob);
  const [job, setJob] = useState<IngestJob | null>(null);
  const [events, setEvents] = useState<IngestEvent[]>([]);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Grade | 'all'>('all');
  const [editing, setEditing] = useState<number | null>(null);
  const seen = useRef(0);

  useEffect(() => { void listSamples().then(setSamples).catch(() => undefined); }, []);

  // poll จนงานจบ; since = จำนวน event ที่เห็นแล้ว (backend ส่งเฉพาะส่วนใหม่)
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await getJob(jobId, seen.current);
        if (!live) return;
        setError('');
        seen.current += j.events.length;
        setEvents((xs) => [...xs, ...j.events]);
        setJob(j);
        if (j.status === 'done' && j.result) return setResult(j.result);
        if (['failed', 'refused', 'cancelled'].includes(j.status)) return setError(j.error ?? 'อ่านไม่สำเร็จ');
      } catch (e) {
        if (!live) return;
        setError(e instanceof Error ? e.message : 'ขาดการเชื่อมต่อ');
        if (e instanceof ApiException && e.code === 'HTTP_404') { // งานหายไป (backend เริ่มใหม่): ลืมงานนี้ แล้วกลับหน้าอัปโหลด
          saveJob(null);
          setJobId(null);
          setError('งานที่อ่านค้างไว้หายไปเพราะเซิร์ฟเวอร์เริ่มใหม่ กรุณาอัปโหลดไฟล์อีกครั้ง');
          return;
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { live = false; clearTimeout(timer); };
  }, [jobId]);

  const begin = useCallback(async (start: () => Promise<{ id: string }>) => {
    setError(''); setResult(null); setJob(null); setEvents([]); setFilter('all'); setEditing(null); seen.current = 0;
    try { const { id } = await start(); saveJob(id); setJobId(id); } catch (e) { setError(e instanceof Error ? e.message : 'ส่งไฟล์ไม่สำเร็จ'); }
  }, []);

  const reset = () => { saveJob(null); setJobId(null); setJob(null); setResult(null); setEvents([]); setError(''); setFile(null); };
  const running = job !== null && (job.status === 'queued' || job.status === 'running');

  const onFix = async (row: IngestRow, fix: RowFix) => {
    if (!jobId || !result) return;
    try {
      const out = await fixRow(jobId, row.i, fix);
      setResult({ ...result, summary: out.summary, rows: result.rows.map((r) => (r.i === row.i ? out.row : r)) });
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่ได้'); }
  };

  if (!jobId) {
    return (
      <>
        <Head title="อ่านหลักสูตรจากไฟล์" subtitle="PDF ข้อความ/สแกน, Word, Excel, รูปถ่าย · ไม่เกิน 20 MB · ไฟล์ถูกส่งไปประมวลผลที่ backend ของเรา" />
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <Card title="อัปโหลดเล่มหลักสูตร">
          <div className="field">
            <label htmlFor="ingest-file">เลือกไฟล์</label>
            <input id="ingest-file" type="file" className="input" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="actions"><Button variant="primary" disabled={!file} onClick={() => file && void begin(() => startRead(file))}>เริ่มวิเคราะห์</Button></div>
        </Card>
        {samples.length > 0 && (
          <Card title="หรือใช้ไฟล์ตัวอย่าง">
            <div className="actions">
              {samples.map((s) => <Button key={s.id} onClick={() => void begin(() => startSample(s.id))} title={s.note}>{s.label}</Button>)}
            </div>
          </Card>
        )}
      </>
    );
  }

  const stages = stageState(events);
  const rows = result?.rows.filter((r) => filter === 'all' || r.grade === filter) ?? [];
  const count = (g: Grade) => result?.rows.filter((r) => r.grade === g).length ?? 0;
  const list = result?.kind === 'course_list';

  return (
    <>
      <Head
        title={job?.file ?? 'กำลังอ่าน…'}
        subtitle={running ? (job?.status === 'queued' ? `รอคิว (มีงานก่อนหน้า ${job.queued_behind})` : `กำลังอ่าน · ${job?.seconds ?? 0} วินาที`) : result ? `เสร็จใน ${result.seconds} วินาที` : undefined}
        actions={<>
          {running && <Button variant="destructive" onClick={() => void cancelJob(jobId).catch((e: Error) => setError(e.message))}>ยกเลิก</Button>}
          <Button onClick={reset} disabled={running}>อ่านไฟล์อื่น</Button>
        </>}
      />
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <Card title="ขั้นตอน">
        <ol className="steps" aria-label="ขั้นตอนการอ่าน">
          {STEPS.filter(([k]) => k !== 'office' || stages.office).map(([k, name]) => {
            const st = stages[k];
            return <li key={k}><Badge tone={st === 'done' ? 'success' : st === 'run' ? 'info' : 'neutral'}>{name}{st === 'run' ? ' …' : ''}</Badge></li>;
          })}
        </ol>
        <PageMap events={events} />
      </Card>
      {events.some((e) => e.event === 'format') && <Card title="แข่งเลือกรูปแบบ"><FormatRace events={events} winner={result?.format} /></Card>}

      {result && (
        <>
          <div className="stats">
            <StatCard label="ใช้ต่อได้ทันที" value={`${result.summary.usable_pct}%`} tone="info" hint={`${result.summary.rows} ${list ? 'วิชา' : 'แถว'} · รูปแบบ ${result.format_name}`} />
            {(['pass', 'check', 'fix', 'unknown', 'fixed'] as Grade[]).map((g) => <StatCard key={g} label={GRADE[g][1]} value={result.summary[g]} tone={GRADE[g][0]} />)}
          </div>
          {result.file_checks.length > 0 && (
            <InlineAlert tone="warning">
              {result.file_checks.map((c, i) => <div key={i}>หน้า {c.page ?? '-'}: {c.th}</div>)}
            </InlineAlert>
          )}
          <Card
            title="รายวิชาที่อ่านได้"
            actions={<>
              {onSchedule && <Button variant="primary" onClick={() => { rememberIngestJob(jobId); onSchedule(); }}>ส่งต่อไปจัดตาราง</Button>}
              <a className="btn btn-secondary" href={exportUrl(jobId, 'json')} download>ส่งออก JSON</a>
              <a className="btn btn-secondary" href={exportUrl(jobId, 'csv')} download>ส่งออก CSV</a>
            </>}
          >
            <div className="actions" role="group" aria-label="กรองตามเกรด">
              {(['all', 'fix', 'check', 'unknown', 'fixed', 'pass'] as const).filter((g) => g === 'all' || count(g)).map((g) => (
                <Button key={g} variant={filter === g ? 'primary' : 'secondary'} aria-pressed={filter === g} onClick={() => { setFilter(g); setEditing(null); }}>
                  {g === 'all' ? 'ทั้งหมด' : GRADE[g][1]} ({g === 'all' ? result.rows.length : count(g)})
                </Button>
              ))}
            </div>
            <table className="dt">
              <thead><tr><th>เกรด</th><th>{list ? 'ประเภท · กลุ่ม' : 'แผน · ปี · ภาค'}</th><th>รหัส</th><th>ชื่อวิชา</th><th>ท.</th><th>ป.</th><th>นก.</th><th>เหตุผล</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <RowView key={r.i} jobId={jobId} row={r} list={list} editing={editing === r.i} onEdit={() => setEditing(editing === r.i ? null : r.i)} onSave={(f) => void onFix(r, f)} />
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}

function RowView({ jobId, row: r, list, editing, onEdit, onSave }: { jobId: string; row: IngestRow; list: boolean; editing: boolean; onEdit: () => void; onSave: (f: RowFix) => void }) {
  const [tone, label] = GRADE[r.grade];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (k: keyof RowFix) => draft[k] ?? String(r[k] ?? '');
  const save = () => {
    const fix: RowFix = {};
    if (val('code') !== r.code) fix.code = val('code');
    if (val('name_th') !== r.name_th) fix.name_th = val('name_th');
    for (const k of ['lecture', 'lab', 'credits'] as const) if (draft[k] !== undefined && draft[k] !== '' && Number(draft[k]) !== r[k]) fix[k] = Number(draft[k]);
    if (Object.keys(fix).length) onSave(fix); else onEdit();
  };
  return (
    <>
      <tr>
        <td><Badge tone={tone}>{label}</Badge></td>
        <td>{list ? `${r.choice ?? ''} · ${(r.group ?? '').slice(0, 40)}` : `${(r.plan ?? '').slice(0, 30)} · ปี ${r.year} · ภาค ${r.term}`}</td>
        <td>{r.code}</td><td>{r.name_th}</td>
        <td>{r.lecture ?? '?'}</td><td>{r.lab ?? '?'}</td><td>{r.credits ?? '?'}</td>
        <td><ul className="plain">{r.reasons.map((x, i) => <li key={i}><Badge tone={LEVEL_TONE[x.level]}>{x.th}</Badge></li>)}</ul></td>
        <td><Button variant="tertiary" aria-expanded={editing} onClick={onEdit}>{editing ? 'ปิด' : 'แก้ไข'}</Button></td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={9}>
            {r.page !== undefined && <RowCrop jobId={jobId} row={r} />}
            <form className="form-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {(['code', 'name_th', 'lecture', 'lab', 'credits'] as const).map((k) => (
                <TextField key={k} label={{ code: 'รหัสวิชา', name_th: 'ชื่อวิชา', lecture: 'ท.', lab: 'ป.', credits: 'นก.' }[k]}
                  type={k === 'code' || k === 'name_th' ? 'text' : 'number'} min={0} max={40} value={val(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              ))}
              <Button type="submit" variant="primary">บันทึก</Button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

/** ภาพตัดของแถวจากหน้าต้นฉบับ (ถ้าไฟล์เป็น PDF และรู้ตำแหน่ง) */
function RowCrop({ jobId, row }: { jobId: string; row: IngestRow }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <p className="muted">ไม่มีภาพของแถวนี้ (ไม่ใช่ PDF หรือไม่รู้ตำแหน่ง)</p>;
  return (
    <figure className="crop">
      <img src={cropUrl(jobId, row.i)} alt={`ภาพต้นฉบับของวิชา ${row.code}`} onError={() => setOk(false)} />
      <figcaption className="muted">หน้า {row.page} ของไฟล์ต้นฉบับ</figcaption>
    </figure>
  );
}
