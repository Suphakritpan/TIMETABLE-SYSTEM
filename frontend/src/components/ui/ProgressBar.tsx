export default function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const v = Math.min(Math.max(value, 0), max);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v}>
      <div className="progress-bar" style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
    </div>
  );
}
