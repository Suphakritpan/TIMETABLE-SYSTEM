import { MIN_PASSWORD } from '../../api/institution';

const RULES: [string, (p: string) => boolean][] = [
  [`ยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`, (p) => p.length >= MIN_PASSWORD],
  ['มีทั้งตัวอักษรและตัวเลข', (p) => /\d/.test(p) && /\D/.test(p)],
  ['ยาว 12 ตัวอักษรขึ้นไป (แนะนำ)', (p) => p.length >= 12],
];
const STRENGTH = ['อ่อน', 'อ่อน', 'พอใช้', 'แข็งแรง'];

// มาตรวัดความแข็งแรง + เงื่อนไขรหัสผ่านใต้ช่องกรอก (ข้อความบอกสถานะเอง ไม่พึ่งสีอย่างเดียว)
export default function PasswordHelp({ value }: { value: string }) {
  const passed = RULES.filter(([, ok]) => ok(value)).length;
  return (
    <>
      {value && (
        <div className="meter" role="status" aria-label={`ความแข็งแรงของรหัสผ่าน: ${STRENGTH[passed]}`}>
          <span className={`meter-bar s${passed}`} /><small>{STRENGTH[passed]}</small>
        </div>
      )}
      <ul className="pw-rules" aria-label="เงื่อนไขรหัสผ่าน">
        {RULES.map(([t, ok]) => <li key={t} className={ok(value) ? 'ok' : undefined}><span aria-hidden="true">{ok(value) ? '✓' : '○'}</span> {t}</li>)}
      </ul>
    </>
  );
}
