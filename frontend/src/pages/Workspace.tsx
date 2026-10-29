// 2.4 พื้นที่ทำงานของโปรไฟล์: Stepper 9 ขั้น + แท็บ หลักสูตร × ชั้นปี (กฎล็อก/ล้าสมัยอยู่ใน profile/steps.ts)
// เนื้อหาของแต่ละขั้นยังเป็น placeholder (ROADMAP T3.3–T3.8) ปุ่ม "ทำขั้นนี้เสร็จ" เป็นของจำลองเพื่อทดสอบกฎ
import { useEffect, useState } from 'react';
import { getProfile, listTerms, updateStep } from '../api/profiles';
import Stepper from '../components/profile/Stepper';
import ReviewStep from '../components/steps/ReviewStep';
import IssuesStep from '../components/steps/IssuesStep';
import AvailabilityStep from '../components/steps/AvailabilityStep';
import AssignStep from '../components/steps/AssignStep';
import GenerateStep from '../components/steps/GenerateStep';
import PublishStep from '../components/steps/PublishStep';
import RulesStep from '../components/steps/RulesStep';
import type { StepProps } from '../components/steps/types';
import { useSession } from '../context/Session';
import Icon from '../components/ui/Icon';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import InlineAlert from '../components/ui/InlineAlert';
import Skeleton from '../components/ui/Skeleton';
import Tabs from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { PROFILE_STATUS, STEP_VIEW } from '../profile/status';
import { STEP_LABELS, frontier, impactOfEdit, view } from '../profile/steps';
import type { Profile, Term } from '../types';
import { termLabel } from '../utils/buddhistEra';

// ขั้นที่มีเนื้อหาจริง (index ของ STEP_LABELS) ที่เหลือเป็น placeholder + ปุ่มจำลอง
const REAL_STEPS: Partial<Record<number, (p: StepProps) => React.JSX.Element>> = {
  2: AvailabilityStep,
  3: IssuesStep,
  4: RulesStep,
  5: GenerateStep,
  6: AssignStep,
  7: ReviewStep,
  8: PublishStep,
};

export default function Workspace({ id, onBack, setStatus = () => {} }: { id: string; onBack: () => void; setStatus?: (s: string) => void }) {
  const toast = useToast();
  const { role } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [confirmEdit, setConfirmEdit] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([getProfile(id), listTerms()])
      .then(([p, t]) => {
        if (!live) return;
        setProfile(p);
        setTerms(t);
        setTab((cur) => cur || p.year_plans[0]?.id || '');
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'); });
    return () => { live = false; };
  }, [id]);

  if (error) return <><InlineAlert tone="error">{error}</InlineAlert><Button onClick={onBack}>กลับไปรายการโปรไฟล์</Button></>;
  if (!profile) return <Skeleton lines={5} label="กำลังโหลดโปรไฟล์" />;

  const yp = profile.year_plans.find((y) => y.id === tab) ?? profile.year_plans[0];
  const f = frontier(yp.steps);
  const sel = selected[yp.id] ?? (f === -1 ? 0 : f);
  const v = view(yp.steps, sel);
  const term = terms.find((t) => t.id === profile.term_id);
  const impact = impactOfEdit(yp.steps, sel);
  const Real = REAL_STEPS[sel];
  const locked = profile.status === 'published';

  const act = async (action: 'complete' | 'edit') => {
    try {
      const p = await updateStep(profile.id, yp.id, sel, action);
      setProfile(p);
      const next = frontier(p.year_plans.find((y) => y.id === yp.id)?.steps ?? []);
      if (action === 'complete' && next !== -1) setSelected((s) => ({ ...s, [yp.id]: next }));
      toast.show(action === 'complete' ? `ขั้น "${STEP_LABELS[sel]}" เสร็จแล้ว` : `บันทึกการแก้ไขขั้น "${STEP_LABELS[sel]}" แล้ว`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', { tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title={profile.name}
        subtitle={term ? `ภาคเรียน ${termLabel(term)}` : undefined}
        actions={<>
          <Badge tone={PROFILE_STATUS[profile.status].tone}>{PROFILE_STATUS[profile.status].label}</Badge>
          <Button onClick={onBack}>← โปรไฟล์</Button>
        </>}
      />

      <Tabs
        label="หลักสูตรและชั้นปี"
        value={yp.id}
        onChange={setTab}
        tabs={profile.year_plans.map((y) => ({
          key: y.id,
          label: `${y.program} ปี ${y.year}`,
          badge: y.steps.includes('stale') ? <span title="มีขั้นล้าสมัย"> <Icon name="alert" size={14} /><span className="sr-only"> มีขั้นล้าสมัย</span></span> : undefined,
        }))}
      >
        <Stepper steps={yp.steps} selected={sel} onSelect={(i) => setSelected((s) => ({ ...s, [yp.id]: i }))} />

        <section className="panel" aria-label={`ขั้น ${STEP_LABELS[sel]}`}>
          <h2>ขั้น {sel + 1}: {STEP_LABELS[sel]} <Badge tone={v === 'done' ? 'success' : v === 'out_of_date' ? 'warning' : 'info'}>{STEP_VIEW[v].label}</Badge></h2>
          {v === 'out_of_date' && (
            <InlineAlert tone="warning">ขั้นก่อนหน้าถูกแก้ไขหลังจากขั้นนี้เสร็จ ต้องตรวจและทำขั้นนี้ใหม่</InlineAlert>
          )}
          {locked && <InlineAlert tone="info">เวอร์ชันนี้เผยแพร่แล้วและถูกล็อก แก้ไขไม่ได้ (VERSION_LOCKED)</InlineAlert>}
          {Real ? (
            v !== 'locked' && (
              <Real
                key={`${yp.id}-${sel}`}
                profile={profile}
                yearPlanId={yp.id}
                done={v === 'done'}
                locked={locked}
                role={role}
                onComplete={() => act('complete')}
                onProfile={setProfile}
                setStatus={setStatus}
              />
            )
          ) : (
            <p className="muted">เนื้อหาของขั้นนี้ยังไม่ได้สร้าง (อยู่ในแผน ROADMAP) ปุ่มด้านล่างเป็นการจำลองเพื่อทดสอบกฎแถบขั้นตอน</p>
          )}
          {!locked && (!Real || v === 'done') && (
            <div className="actions">
              {v === 'done' ? (
                <Button onClick={() => (impact.length ? setConfirmEdit(true) : void act('edit'))}>แก้ไขข้อมูลขั้นนี้{Real ? '' : ' (จำลอง)'}</Button>
              ) : (
                <Button variant="primary" onClick={() => void act('complete')}>ทำขั้นนี้เสร็จ (จำลอง)</Button>
              )}
            </div>
          )}
        </section>
      </Tabs>

      <ConfirmDialog
        open={confirmEdit}
        title={`แก้ไขขั้น "${STEP_LABELS[sel]}"`}
        confirmLabel="แก้ไขและทำให้ขั้นหลังล้าสมัย"
        onCancel={() => setConfirmEdit(false)}
        onConfirm={() => { setConfirmEdit(false); void act('edit'); }}
      >
        <p>จะทำให้ขั้นต่อไปนี้ของ {yp.program} ปี {yp.year} ล้าสมัย และต้องทำใหม่ (ปีอื่นไม่ได้รับผลกระทบ):</p>
        <ul>{impact.map((i) => <li key={i}>ขั้น {i + 1}: {STEP_LABELS[i]}</li>)}</ul>
      </ConfirmDialog>
    </>
  );
}
