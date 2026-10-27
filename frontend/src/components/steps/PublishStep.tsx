// ขั้น 9: เผยแพร่ (เฉพาะ HEAD) + พิมพ์ต่อกลุ่ม/อาจารย์/ห้อง
// PDF: ใช้ "พิมพ์ → บันทึกเป็น PDF" ของเบราว์เซอร์ (ฟอนต์ไทยถูกต้องโดยไม่ต้องเพิ่มไลบรารี) ถ้าต้องไฟล์ PDF โดยตรงค่อยเลือกไลบรารี (ROADMAP T3.8 ❓)
import { useMemo, useState } from 'react';
import { publishProfile } from '../../api/profiles';
import { loadLastRun } from '../../api/runs';
import { DAYS, PERIODS } from '../../data/sample';
import TimetableGrid from '../timetable/TimetableGrid';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import InlineAlert from '../ui/InlineAlert';
import { useToast } from '../ui/Toast';
import type { StepProps } from './types';

type By = 'all' | 'teacher' | 'room';

export default function PublishStep({ profile, role, onProfile }: StepProps) {
  const toast = useToast();
  const run = loadLastRun(profile.id);
  const [confirm, setConfirm] = useState(false);
  const [by, setBy] = useState<By>('all');
  const [val, setVal] = useState('');
  const published = profile.status === 'published';
  const isHead = role === 'HEAD';

  const options = useMemo(() => {
    const placed = run?.placed ?? [];
    return [...new Set(placed.flatMap((p) => (by === 'room' ? [p.room] : by === 'teacher' ? p.teacher.split(' + ') : [])))];
  }, [run, by]);
  const shown = (run?.placed ?? []).filter((p) => by === 'all' || !val || (by === 'room' ? p.room === val : p.teacher.includes(val)));

  const publish = async () => {
    setConfirm(false);
    try {
      onProfile(await publishProfile(profile.id, role ?? ''));
      toast.show('เผยแพร่แล้ว เวอร์ชันนี้ถูกล็อก');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'เผยแพร่ไม่สำเร็จ', { tone: 'error' });
    }
  };

  return (
    <>
      {!published && (
        <div className="actions">
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!isHead} title={isHead ? undefined : 'เฉพาะหัวหน้าเท่านั้นที่เผยแพร่ได้ (HEAD_ONLY)'}>เผยแพร่</Button>
          {!isHead && <span className="muted">ผู้ช่วยเผยแพร่ไม่ได้ ขอให้หัวหน้ากดเผยแพร่</span>}
        </div>
      )}
      {published && <InlineAlert tone="success">เผยแพร่แล้ว เวอร์ชันนี้ถูกล็อก แก้ไม่ได้ (การเปลี่ยนแปลงภายหลังสร้างเวอร์ชันใหม่)</InlineAlert>}

      <h3>พิมพ์ / ดาวน์โหลด</h3>
      {!run ? <EmptyState>ยังไม่มีตาราง กลับไปขั้น 6</EmptyState> : (
        <>
          <div className="toolbar">
            <select className="input" aria-label="พิมพ์ตาม" value={by} onChange={(e) => { setBy(e.target.value as By); setVal(''); }}>
              <option value="all">ทั้งหมด</option>
              <option value="teacher">ตามอาจารย์</option>
              <option value="room">ตามห้อง</option>
            </select>
            {by !== 'all' && (
              <select className="input" aria-label="เลือก" value={val} onChange={(e) => setVal(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {options.map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
            <Button onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</Button>
          </div>
          <section className="a4" aria-label="ตัวอย่างที่จะพิมพ์">
            <h2 className="print-title">{profile.name}{published ? '' : ' (ร่าง)'}{val ? ` · ${val}` : ''}</h2>
            <TimetableGrid days={DAYS} periods={PERIODS} items={shown} selectedId={null} onSelect={() => {}} />
          </section>
        </>
      )}

      <ConfirmDialog open={confirm} title="เผยแพร่ตารางเรียน" confirmLabel="เผยแพร่ตาราง" onCancel={() => setConfirm(false)} onConfirm={() => void publish()}>
        <p>เวอร์ชันนี้จะถูกล็อก แก้ไขไม่ได้ และแจ้งอาจารย์ทุกคน การเปลี่ยนแปลงภายหลังต้องสร้างเวอร์ชันใหม่</p>
      </ConfirmDialog>
    </>
  );
}
