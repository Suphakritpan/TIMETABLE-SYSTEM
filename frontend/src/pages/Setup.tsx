// 0.0 ตั้งค่าครั้งแรก: แสดงครั้งเดียวหลังติดตั้ง (docker compose up) ตั้งสถาบัน ผู้ดูแลคนแรก
// ไม่ทำในหน้านี้ (ต้องมี backend): hash รหัสผ่าน, ยืนยันอีเมล (ไม่มี SMTP), รหัสกู้คืนบัญชี
import { useState, type FormEvent } from 'react';
import { INST_CODE_RE, MIN_PASSWORD, PHONE_RE, POSTCODE_RE, URL_RE, USERNAME_RE, seedDemoInstitution, setup } from '../api/institution';
import { ApiException } from '../api/types';
import Button from '../components/ui/Button';
import SearchSelect from '../components/ui/SearchSelect';
import { SelectField, TextField } from '../components/ui/Field';
import Icon from '../components/ui/Icon';
import ImagePick, { readImage } from '../components/ui/ImagePick';
import InlineAlert from '../components/ui/InlineAlert';
import { useToast } from '../components/ui/Toast';
import { PROVINCES } from '../data/provinces';
import { useSession } from '../context/Session';

type Key = 'name' | 'address' | 'province' | 'postcode' | 'contactEmail' | 'contactPhone' | 'website' | 'code' | 'logo' | 'firstName' | 'lastName' | 'phone' | 'username' | 'email' | 'password' | 'confirm' | 'terms' | 'avatar';
type Errors = Partial<Record<Key, string>>;


const RULES: [string, (p: string) => boolean][] = [
  [`ยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`, (p) => p.length >= MIN_PASSWORD],
  ['มีทั้งตัวอักษรและตัวเลข', (p) => /\d/.test(p) && /\D/.test(p)],
  ['ยาว 12 ตัวอักษรขึ้นไป (แนะนำ)', (p) => p.length >= 12],
];
const STRENGTH = ['อ่อน', 'อ่อน', 'พอใช้', 'แข็งแรง'];

export default function Setup({ onDone }: { onDone: () => void }) {
  const { signIn } = useSession();
  const toast = useToast();
  const [f, setF] = useState({
    name: '', language: 'th' as 'th' | 'en', address: '', province: '', postcode: '', contactEmail: '', contactPhone: '', website: '', code: '', director: '', firstName: '', lastName: '', phone: '', username: '', email: '', password: '', confirm: '',
  });
  const [avatar, setAvatar] = useState<string>();
  const [logo, setLogo] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [userTouched, setUserTouched] = useState(false); // ชื่อผู้ใช้เติมจากอีเมลให้ จนกว่าผู้ใช้จะแก้เอง
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setEmail = (e: { target: { value: string } }) => {
    const email = e.target.value;
    const guess = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    setF({ ...f, email, username: userTouched ? f.username : guess.length >= 3 ? guess.slice(0, 30) : '' });
  };
  const pick = (k: 'avatar' | 'logo', set: (v?: string) => void) => (file: File) =>
    readImage(file).then((v) => { set(v); setErrors((e) => ({ ...e, [k]: undefined })); }, (err: Error) => setErrors((e) => ({ ...e, [k]: err.message })));

  const passed = RULES.filter(([, ok]) => ok(f.password)).length;
  const pwType = show ? 'text' : 'password';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Errors = {};
    if (!f.name.trim()) next.name = 'กรอกชื่อสถาบัน';
    if (!f.address.trim()) next.address = 'กรอกที่อยู่';
    if (!f.province) next.province = 'เลือกจังหวัด';
    if (!POSTCODE_RE.test(f.postcode.trim())) next.postcode = 'รหัสไปรษณีย์ 5 หลัก';
    if (!/^\S+@\S+\.\S+$/.test(f.contactEmail)) next.contactEmail = 'อีเมลสถาบันไม่ถูกต้อง';
    if (!PHONE_RE.test(f.contactPhone.trim())) next.contactPhone = 'เบอร์โทรสถาบันไม่ถูกต้อง';
    if (f.website.trim() && !URL_RE.test(f.website.trim())) next.website = 'ขึ้นต้นด้วย http:// หรือ https://';
    if (f.code.trim() && !INST_CODE_RE.test(f.code.trim())) next.code = 'รหัสสถานศึกษา 10 หลัก';
    if (!f.firstName.trim()) next.firstName = 'กรอกชื่อจริง';
    if (!f.lastName.trim()) next.lastName = 'กรอกนามสกุล';
    if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) next.phone = 'เบอร์โทรไม่ถูกต้อง';
    if (!USERNAME_RE.test(f.username.trim())) next.username = 'ชื่อผู้ใช้ 3–30 ตัว ใช้ a-z 0-9 . _ - เท่านั้น';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) next.email = 'อีเมลไม่ถูกต้อง';
    if (f.password.length < MIN_PASSWORD) next.password = `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
    if (f.confirm !== f.password) next.confirm = 'รหัสผ่านไม่ตรงกัน';
    if (!terms) next.terms = 'ต้องยอมรับข้อกำหนดก่อนดำเนินการต่อ';
    setErrors((old) => ({ avatar: old.avatar, ...next }));
    const n = Object.keys(next).length;
    if (n) {
      setFail(`กรุณาตรวจสอบ ${n} ช่องที่มีเครื่องหมาย ✕`);
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    setFail('');
    try {
      const admin = await setup({
        name: f.name, type: 'vocational', language: f.language,
        address: f.address, province: f.province, postcode: f.postcode, contact_email: f.contactEmail, contact_phone: f.contactPhone,
        website: f.website, code: f.code, director: f.director, logo, firstName: f.firstName, lastName: f.lastName, phone: f.phone, avatar,
        username: f.username, email: f.email, password: f.password,
      });
      toast.show(`ตั้งค่าเสร็จแล้ว ยินดีต้อนรับ ${admin.name}`);
      signIn(admin);
      onDone();
    } catch (err) {
      // ข้อผิดพลาดซ้ำแสดงที่ช่องที่เกี่ยวข้อง
      const code = err instanceof ApiException ? err.code : '';
      if (code === 'DUPLICATE_EMAIL') setErrors({ email: 'มีบัญชีใช้อีเมลนี้แล้ว' });
      else if (code === 'DUPLICATE_USERNAME') setErrors({ username: 'มีบัญชีใช้ชื่อผู้ใช้นี้แล้ว' });
      else setFail(err instanceof Error ? err.message : 'ตั้งค่าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <aside className="auth-side">
          <span className="auth-art" aria-hidden="true"><Icon name="layers" size={56} /></span>
          <h2>เริ่มต้นใช้งานใน 2 ส่วน</h2>
          <ol className="setup-steps">
            <li><span aria-hidden="true">1</span><div><strong>ข้อมูลสถาบัน</strong><small>ชื่อ ที่ตั้ง ช่องทางติดต่อ โลโก้</small></div></li>
            <li><span aria-hidden="true">2</span><div><strong>บัญชีผู้ดูแล</strong><small>ชื่อ อีเมล รหัสผ่าน (กรอกครั้งเดียว)</small></div></li>
          </ol>
          <p className="auth-note setup-note">หน้านี้แสดงครั้งเดียวหลังติดตั้ง</p>
        </aside>

        <form className="auth-form setup-form" onSubmit={submit} aria-labelledby="setup-h" noValidate>
          <span className="brand-mark"><Icon name="calendar" size={30} /></span>
          <h1 id="setup-h">ตั้งค่าครั้งแรก</h1>
          <p className="muted">ตั้งค่าสถาบันและสร้างบัญชีผู้ดูแลคนแรก ช่องที่ไม่มี “ไม่บังคับ” ต้องกรอก</p>
          {fail && <InlineAlert tone="error">{fail}</InlineAlert>}

          <fieldset className="setup-group">
            <legend><Icon name="layers" size={18} /> 1. ข้อมูลสถาบัน</legend>
            <div className="setup-grid">
              <TextField label="ชื่อสถาบัน" value={f.name} onChange={set('name')} error={errors.name} />
              <TextField label="รหัสสถานศึกษา (ไม่บังคับ)" inputMode="numeric" value={f.code} onChange={set('code')} error={errors.code} hint="10 หลัก" />
              <p className="field">ประเภทสถานศึกษา<strong>อาชีวศึกษา</strong><span className="muted">รองรับอาชีวศึกษาก่อน (อื่น ๆ อยู่ในแผน)</span></p>
              <SelectField label="ภาษา" value={f.language} onChange={set('language')}>
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </SelectField>
            </div>
            <TextField label="ที่ตั้ง (เลขที่ ถนน ตำบล อำเภอ)" autoComplete="street-address" value={f.address} onChange={set('address')} error={errors.address} />
            <div className="setup-grid">
              <div>
                <SearchSelect label="จังหวัด" placeholder="-- เลือกจังหวัด --" options={PROVINCES} value={f.province} onChange={(v) => setF({ ...f, province: v })} />
                {errors.province && <span className="field-error"><span aria-hidden="true">✕ </span>{errors.province}</span>}
              </div>
              <TextField label="รหัสไปรษณีย์" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={f.postcode} onChange={set('postcode')} error={errors.postcode} />
              <TextField label="อีเมลสถาบัน" type="email" value={f.contactEmail} onChange={set('contactEmail')} error={errors.contactEmail} hint="อีเมลกลางสำหรับติดต่อ (ต่างจากอีเมลผู้ดูแล)" />
              <TextField label="เบอร์โทรสถาบัน" type="tel" autoComplete="tel" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} />
            </div>
            <details className="setup-opt">
              <summary>ข้อมูลเพิ่มเติม <span className="muted">(ไม่บังคับ)</span></summary>
              <div className="setup-grid">
                <TextField label="เว็บไซต์" type="url" placeholder="https://" value={f.website} onChange={set('website')} error={errors.website} />
                <TextField label="ผู้อำนวยการ" value={f.director} onChange={set('director')} />
              </div>
              <ImagePick label="โลโก้สถาบัน" value={logo} error={errors.logo} onPick={pick('logo', setLogo)} onClear={() => setLogo(undefined)} />
            </details>
          </fieldset>

          <fieldset className="setup-group">
            <legend><Icon name="shield" size={18} /> 2. บัญชีผู้ดูแล</legend>
            <div className="setup-grid">
              <TextField label="ชื่อจริง" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} error={errors.firstName} />
              <TextField label="นามสกุล" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} error={errors.lastName} />
              <TextField label="อีเมลผู้ดูแล" type="email" autoComplete="username" value={f.email} onChange={setEmail} error={errors.email} hint="ใช้ติดต่อ เข้าสู่ระบบ และกู้คืนบัญชี" />
              <TextField label="ชื่อผู้ใช้ (Username)" autoComplete="off" value={f.username} onChange={(e) => { setUserTouched(true); set('username')(e); }} error={errors.username} hint="เติมจากอีเมลให้ แก้ได้ ใช้เข้าสู่ระบบแทนอีเมลได้" />
              <TextField label="รหัสผ่าน" type={pwType} autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`} />
              <TextField label="ยืนยันรหัสผ่าน" type={pwType} autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />
            </div>
            <div className="pw-row">
              <Button variant="tertiary" aria-pressed={show} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={() => setShow(!show)}>{show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</Button>
              {f.password && (
                <div className="meter" role="status" aria-label={`ความแข็งแรงของรหัสผ่าน: ${STRENGTH[passed]}`}>
                  <span className={`meter-bar s${passed}`} /><small>{STRENGTH[passed]}</small>
                </div>
              )}
            </div>
            <ul className="pw-rules" aria-label="เงื่อนไขรหัสผ่าน">
              {RULES.map(([t, ok]) => <li key={t} className={ok(f.password) ? 'ok' : undefined}><span aria-hidden="true">{ok(f.password) ? '✓' : '○'}</span> {t}</li>)}
            </ul>
            <details className="setup-opt">
              <summary>ข้อมูลเพิ่มเติม <span className="muted">(ไม่บังคับ แก้ภายหลังที่หน้าบัญชีได้)</span></summary>
              <TextField label="เบอร์โทรศัพท์" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
              <ImagePick label="รูปโปรไฟล์" value={avatar} error={errors.avatar} onPick={pick('avatar', setAvatar)} onClear={() => setAvatar(undefined)} />
            </details>
            <p className="muted">ระบบจะเก็บรหัสผ่านแบบเข้ารหัส (hash) ที่ฝั่งเซิร์ฟเวอร์ ส่วนการยืนยันอีเมลและรหัสกู้คืนบัญชีจะเปิดใช้เมื่อระบบส่งอีเมลได้ ชื่อที่แสดงในระบบใช้ ชื่อจริง + นามสกุล</p>
            <label className="check"><input type="checkbox" checked={terms} aria-invalid={errors.terms ? true : undefined} onChange={(e) => setTerms(e.target.checked)} /> ฉันยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว</label>
            {errors.terms && <span className="field-error"><span aria-hidden="true">✕ </span>{errors.terms}</span>}
          </fieldset>

          <Button variant="primary" type="submit" className="btn-block" loading={busy}>{busy ? 'กำลังตั้งค่า…' : 'ตั้งค่าและเข้าสู่ระบบ'}</Button>
          <div className="or" role="separator"><span>หรือ</span></div>
          <p className="muted center">
            ทดลอง (mock):{' '}
            <button type="button" className="th-btn link" onClick={() => { seedDemoInstitution(); onDone(); }}>ข้ามไปใช้สถาบันและบัญชีตัวอย่าง</button>
          </p>
        </form>
      </div>
    </main>
  );
}
