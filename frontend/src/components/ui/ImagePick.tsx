// เลือกรูป (โปรไฟล์/โลโก้): เก็บเป็น data URL ใน mock จึงจำกัดชนิดและขนาด
import { useRef, useState } from 'react';
import Button from './Button';
import Icon from './Icon';

const MAX_IN = 10 * 1024 * 1024; // ไฟล์ที่รับเข้า
const MAX_SIDE = 512; // ย่อด้านยาวสุดลงเหลือเท่านี้ ให้ data URL ที่เก็บเล็กพอสำหรับ localStorage ของ mock
// shortcut: ย่อ+บีบรูปที่ฝั่งเบราว์เซอร์แล้วเก็บเป็น data URL, ใช้ระบบอัปโหลดไฟล์จริงเมื่อมี backend
export async function readImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('เลือกไฟล์รูปภาพเท่านั้น');
  if (file.size > MAX_IN) throw new Error('รูปใหญ่เกิน 10 MB');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/webp', 0.85); // คงความโปร่งใสของโลโก้
  } catch {
    throw new Error('อ่านรูปไม่สำเร็จ ลองไฟล์ PNG หรือ JPG');
  }
}

export default function ImagePick({ label, value, error, onPick, onClear }: { label: string; value?: string; error?: string; onPick: (f: File) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <span>{label} <span className="muted">(ไม่บังคับ)</span></span>
      <div className="img-pick">
        {value ? <img src={value} alt={`ตัวอย่าง${label}`} /> : <span className="img-ph" aria-hidden="true"><Icon name="user" size={22} /></span>}
        <input ref={ref} type="file" accept="image/*" hidden aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
        <Button onClick={() => ref.current?.click()}>{value ? 'เปลี่ยนรูป' : 'เลือกรูป'}</Button>
        {value && <Button variant="tertiary" onClick={onClear}>ลบรูป</Button>}
      </div>
      {error ? <span className="field-error"><span aria-hidden="true">✕ </span>{error}</span> : <span className="muted">PNG/JPG ไม่เกิน 10 MB (ระบบย่อให้อัตโนมัติ)</span>}
    </div>
  );
}


const MAX_PHOTOS = 6;
/** เลือกได้หลายรูป (รูปแรกเป็นรูปปก) เก็บเป็น data URL เหมือน ImagePick */
export function MultiImagePick({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const add = async (files: FileList) => {
    const room = MAX_PHOTOS - value.length;
    try {
      const added = await Promise.all([...files].slice(0, room).map(readImage));
      onChange([...value, ...added]);
      setError(files.length > room ? `เพิ่มได้สูงสุด ${MAX_PHOTOS} รูป` : undefined);
    } catch (e) { setError(e instanceof Error ? e.message : 'เพิ่มรูปไม่สำเร็จ'); }
  };
  return (
    <div className="field">
      <span>{label} <span className="muted">(ไม่บังคับ, สูงสุด {MAX_PHOTOS} รูป)</span></span>
      <div className="img-pick img-multi">
        {value.map((src, n) => (
          <span key={n} className="img-thumb">
            <img src={src} alt={`${label} ${n + 1}`} />
            {n === 0 && <span className="img-cover">ปก</span>}
            <button type="button" aria-label={`ลบ${label} ${n + 1}`} onClick={() => onChange(value.filter((_, k) => k !== n))}>✕</button>
          </span>
        ))}
        <input ref={ref} type="file" accept="image/*" multiple hidden aria-label={label} onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
        {value.length < MAX_PHOTOS && <Button onClick={() => ref.current?.click()}>เพิ่มรูป</Button>}
      </div>
      {error ? <span className="field-error"><span aria-hidden="true">✕ </span>{error}</span> : <span className="muted">PNG/JPG ไม่เกิน 10 MB ต่อรูป (ระบบย่อให้อัตโนมัติ)</span>}
    </div>
  );
}
