-- รันครั้งเดียวใน Supabase > SQL editor
-- RLS ปิดไว้โดยตั้งใจ (ใช้ในเครื่องพัฒนาเท่านั้น): anon key อ่านเขียนได้ทุกแถว ห้ามใช้กับข้อมูลจริง
create table if not exists public.kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kv disable row level security;
