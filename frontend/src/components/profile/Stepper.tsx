import { STEP_VIEW } from '../../profile/status';
import { STEP_LABELS, canOpen, lockReason, view, type StepStatus } from '../../profile/steps';

interface Props { steps: StepStatus[]; selected: number; onSelect: (i: number) => void }

// แถบขั้นตอน 9 ขั้น: สถานะ = ไอคอน + ข้อความ (ไม่พึ่งสี) ขั้นที่เปิดไม่ได้ใช้ aria-disabled + title บอกเหตุผล
export default function Stepper({ steps, selected, onSelect }: Props) {
  return (
    <ol className="stepper" aria-label="ขั้นตอนของโปรไฟล์">
      {STEP_LABELS.map((label, i) => {
        const v = view(steps, i);
        const open = canOpen(steps, i);
        const reason = lockReason(steps, i);
        return (
          <li key={label}>
            <button
              type="button"
              className={`step step-${v}`}
              aria-current={i === selected ? 'step' : undefined}
              aria-disabled={!open || undefined}
              title={reason ?? undefined}
              onClick={() => open && onSelect(i)}
            >
              <span aria-hidden="true">{STEP_VIEW[v].mark} </span>
              {i + 1}. {label}
              <span className="sr-only"> ({STEP_VIEW[v].label})</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
