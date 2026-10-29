// เก็บสถานะของ mock ทุกโมดูลไว้บน Supabase ตาราง kv(key, value) แบบ snapshot (ดู supabase/schema.sql)
// shortcut: เขียนทับทั้งก้อนต่อ key ไม่มี merge, เปิดสองเครื่องพร้อมกันจะทับกัน; อัปเกรดเป็นตารางสัมพันธ์เมื่อต้องการ
// ไม่เรียก hydrate() (เช่นใน test) = ไม่แตะเครือข่ายเลย
interface Part { get: () => unknown; set: (v: any) => void } // eslint-disable-line @typescript-eslint/no-explicit-any
const parts = new Map<string, Part>();
const last = new Map<string, string>();

export const persist = (key: string, get: () => unknown, set: (v: any) => void) => { parts.set(key, { get, set }); }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** โหลดสถานะจาก cloud ก่อน render; ถ้าติดต่อไม่ได้ใช้ข้อมูลตั้งต้นของ mock และไม่เขียนทับ cloud */
export async function hydrate(): Promise<void> {
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.from('kv').select('key,value');
  if (error) { console.error('[supabase] โหลดไม่ได้ ใช้ข้อมูล mock ในเครื่อง:', error.message); return; }
  for (const r of data) {
    const p = parts.get(r.key);
    if (!p) continue;
    p.set(r.value);
    last.set(r.key, JSON.stringify(p.get()));
  }
  const flush = async () => {
    for (const [key, p] of parts) {
      const s = JSON.stringify(p.get() ?? null);
      if (s === last.get(key)) continue;
      last.set(key, s);
      const { error: e } = await supabase.from('kv').upsert({ key, value: JSON.parse(s) });
      if (e) { last.delete(key); console.error('[supabase] บันทึกไม่ได้:', key, e.message); }
    }
  };
  setInterval(flush, 1000);
}
