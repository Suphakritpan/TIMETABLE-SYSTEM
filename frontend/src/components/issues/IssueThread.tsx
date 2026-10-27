// เธรดความเห็นของรายการเดียว ใช้ร่วมกันสองฝั่ง: หัวหน้า (ขั้น 4) และอาจารย์ (4.3) เห็นเธรดเดียวกัน
import { useState, type FormEvent } from 'react';
import { addComment, OUTCOME_LABEL, type Issue } from '../../api/issues';
import { useSession } from '../../context/Session';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';

const fmt = (ms: number) => new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export default function IssueThread({ issue, onChange, nameOf }: { issue: Issue; onChange: (i: Issue) => void; nameOf?: (id: string) => string }) {
  const { user } = useSession();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      onChange(await addComment(issue.id, { id: user.id, name: user.name }, body));
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={`ความเห็นของ ${issue.title}`}>
      <h4>ความเห็น ({issue.comments.length})</h4>
      {issue.comments.length === 0 ? <p className="muted">ยังไม่มีความเห็น</p> : (
        <ul className="thread">
          {issue.comments.map((c) => (
            <li key={c.id}><b>{c.author_name}</b> <span className="muted">{fmt(c.at)}</span><br />{c.body}</li>
          ))}
        </ul>
      )}
      {issue.decision && (
        <InlineAlert tone="success">
          ตัดสินใจแล้ว: <b>{OUTCOME_LABEL[issue.decision.outcome]}</b> · {issue.decision.note}<br />
          <small>โดย {nameOf?.(issue.decision.decided_by) ?? issue.decision.decided_by} เมื่อ {fmt(issue.decision.decided_at)}</small>
        </InlineAlert>
      )}
      {issue.state === 'open' ? (
        <form onSubmit={send}>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <label className="field">เขียนความเห็น
            <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy}>ส่งความเห็น</Button>
        </form>
      ) : <Badge tone="success">ปิดแล้ว</Badge>}
    </section>
  );
}
