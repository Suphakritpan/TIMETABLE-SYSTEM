import { createClient } from '@supabase/supabase-js';

// publishable key เปิดเผยฝั่ง browser ได้ ความปลอดภัยต้องมาจาก RLS ในฐานข้อมูล
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
