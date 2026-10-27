import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface Shared { label: string; hint?: string; error?: string }

// label ผูกกับช่องเสมอ, error ผูกด้วย aria-describedby และมีข้อความ+ไอคอน (ไม่ใช้สีอย่างเดียว) — design-system §6.3
function Wrap({ id, label, hint, error, children }: Shared & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span id={`${id}-d`} className="muted">{hint}</span>}
      {error && <span id={`${id}-d`} className="field-error"><span aria-hidden="true">✕ </span>{error}</span>}
    </div>
  );
}

export function TextField({ label, hint, error, ...rest }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${id}-d` : undefined} {...rest} />
    </Wrap>
  );
}

export function SelectField({ label, hint, error, children, ...rest }: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <select id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${id}-d` : undefined} {...rest}>
        {children}
      </select>
    </Wrap>
  );
}
