import { useId } from 'react';

interface Props { label: string; value: string; onChange: (v: string) => void; placeholder?: string }

export default function SearchInput({ label, value, onChange, placeholder }: Props) {
  const id = useId();
  return (
    <div className="search">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} className="input" type="search" value={value} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
