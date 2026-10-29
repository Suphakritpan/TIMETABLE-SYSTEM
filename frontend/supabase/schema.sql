-- Schema ฐานข้อมูลระบบตารางเรียน (Supabase / PostgreSQL 15+)
-- รันทั้งไฟล์ครั้งเดียวใน Supabase > SQL editor ได้ซ้ำ (idempotent) ยกเว้นส่วน 9 ที่ปิด RLS ของตาราง kv โดยตั้งใจ
--
-- ที่มา: doc/th/6-er-diagram/er-diagram.mmd (35 entity) + ฟิลด์ที่ frontend ใช้จริงใน src/api/*
-- ฟิลด์/ตารางที่เพิ่มจาก ER ต้นฉบับ (ต้องให้ทีม backend ยืนยัน):
--   users.{first_name,last_name,username,phone,position,line_id,office,avatar_url}, institution.{ที่อยู่/ติดต่อ/โลโก้},
--   room.{location,photos,equipment,note,description}, course.institution_id, room_booking.term_id,
--   scheduled_class.{unplaced_reason,unplaced_fix} (คาบที่ยังไม่ลงใช้ weekday/period = null), generation_run.status ขยายเป็น 6 ค่า
--
-- สารบัญ: 1 enum · 2 สถาบัน · 3 ผู้ใช้ · 4 หลักสูตร/โปรไฟล์ · 5 เวลาว่าง · 6 ปัญหา/รัน/ตาราง · 7 trigger (invariants) ·
--         8 RLS + view สาธารณะ · 9 kv (ชั่วคราวสำหรับ mock)

create extension if not exists pgcrypto;

-- ───────────────────────── 1. enum ─────────────────────────
do $$ begin
  create type institution_type  as enum ('vocational', 'university');
  create type app_language      as enum ('th', 'en');
  create type member_role       as enum ('HEAD', 'ASSISTANT', 'TEACHER');
  create type profile_status    as enum ('draft', 'review', 'published');
  create type year_plan_state   as enum ('not_started', 'done', 'out_of_date');
  create type format_status     as enum ('unverified', 'approved');
  create type elective_mode     as enum ('SCHEDULE', 'RESERVE');
  create type round_state       as enum ('open', 'closed');
  create type response_status   as enum ('submitted', 'late', 'filled_by_head', 'any_time');
  create type issue_severity    as enum ('BLOCKER', 'WARNING');
  create type issue_state       as enum ('open', 'closed');
  create type decision_outcome  as enum ('assign', 'outside_teacher', 'split', 'accept', 'change');
  create type rule_kind         as enum ('hard', 'soft');
  create type precheck_result   as enum ('OK', 'problems', 'risky');
  create type run_status        as enum ('queued', 'running', 'ok', 'partial', 'failed', 'cancelled');
  create type request_status    as enum ('waiting', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ตัวช่วยอัปเดต updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── 2. สถาบัน ─────────────────────────
create table if not exists public.institution (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  type          institution_type not null,
  language      app_language not null default 'th',
  code          text check (code ~ '^\d{10}$'),                 -- รหัสสถานศึกษา 10 หลัก
  address       text,
  province      text,
  postcode      text check (postcode ~ '^\d{5}$'),
  contact_email text,
  contact_phone text check (contact_phone ~ '^[0-9+\-\s]{8,15}$'),
  website       text check (website ~* '^https?://\S+\.\S+$'),
  director      text,
  logo_url      text,                                           -- data URL (mock) หรือ Storage path
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.department (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution(id) on delete cascade,
  name           text not null check (btrim(name) <> ''),
  created_at     timestamptz not null default now(),
  unique (institution_id, name)
);

create table if not exists public.academic_term (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution(id) on delete cascade,
  term_no        int  not null check (term_no between 1 and 3),
  year_ce        int  not null check (year_ce between 1990 and 2200),
  label          text generated always as (term_no::text || '/' || (year_ce + 543)::text) stored, -- แสดงเป็น พ.ศ.
  start_date     date not null,
  end_date       date not null,
  check (end_date > start_date),
  unique (institution_id, term_no, year_ce)
);

create table if not exists public.holiday (
  id      uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.academic_term(id) on delete cascade,
  day     date not null,
  name    text not null,
  unique (term_id, day)
);

create table if not exists public.room (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution(id) on delete cascade,
  department_id  uuid references public.department(id) on delete cascade, -- null = ห้องร่วม
  name           text not null check (btrim(name) <> ''),
  type           text not null default 'ห้องเรียน',
  seats          int  not null check (seats > 0),
  location       text not null default '',
  description    text,
  equipment      text,
  note           text,
  photos         text[] not null default '{}' check (cardinality(photos) <= 6), -- รูปแรก = รูปปก
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- ชื่อห้องไม่ซ้ำภายในแผนก (ห้องร่วมนับเป็นกลุ่มเดียวกัน)
create unique index if not exists room_name_uq
  on public.room (institution_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
drop trigger if exists room_touch on public.room;
create trigger room_touch before update on public.room for each row execute function public.touch_updated_at();

-- ───────────────────────── 3. ผู้ใช้ ─────────────────────────
-- รหัสผ่านอยู่ที่ auth.users ของ Supabase Auth (ไม่มี password_hash ในตารางเรา)
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid references public.institution(id) on delete set null,
  name        text not null check (btrim(name) <> ''),
  first_name  text,
  last_name   text,
  username    text unique check (username ~ '^[A-Za-z0-9._-]{3,30}$'),
  email       text not null unique,
  language    app_language not null default 'th',
  is_admin    boolean not null default false,   -- ผู้ดูแลสถาบัน (ระดับสถาบัน ไม่อยู่ใน membership) — D12
  phone       text check (phone ~ '^[0-9+\-\s]{8,15}$'),
  position    text,                             -- ตำแหน่งหน้าที่
  line_id     text,
  office      text,                             -- ห้องทำงาน/ที่ติดต่อ
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();

create table if not exists public.membership (
  user_id       uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.department(id) on delete cascade,
  role          member_role not null,
  primary key (user_id, department_id)
);
create unique index if not exists membership_one_head on public.membership (department_id) where role = 'HEAD';
create index if not exists membership_dept_idx on public.membership (department_id);

create table if not exists public.invite (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.department(id) on delete cascade,
  email         text not null,
  role          member_role not null,
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at    timestamptz not null,
  accepted_at   timestamptz
);
create unique index if not exists invite_pending_uq on public.invite (department_id, lower(email)) where accepted_at is null;

create table if not exists public.password_reset (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  created_by  uuid not null references public.users(id),   -- ADMIN | HEAD | ASSISTANT | ตัวเอง
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create table if not exists public.notification (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  body       text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notification_user_idx on public.notification (user_id, created_at desc);

-- ───────────────────────── 4. หลักสูตร / โปรไฟล์ ─────────────────────────
create table if not exists public.program (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.department(id) on delete cascade,
  name          text not null check (btrim(name) <> ''),    -- ค.บ. | เทียบโอน | ศษ.ม. | ปร.ด.
  unique (department_id, name)
);

create table if not exists public.curriculum_format (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institution(id) on delete cascade, -- null = มากับระบบ
  name           text not null,
  definition     jsonb not null default '{}',               -- คอลัมน์ รูปแบบหน่วยกิต
  status         format_status not null default 'unverified'
);

create table if not exists public.course (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution(id) on delete cascade,
  code           text not null,
  name           text not null,
  credits_l      int not null default 0 check (credits_l >= 0),  -- ทฤษฎี
  credits_p      int not null default 0 check (credits_p >= 0),  -- ปฏิบัติ
  credits_s      int not null default 0 check (credits_s >= 0),  -- ศึกษาด้วยตนเอง
  unique (institution_id, code)
);

create table if not exists public.profile (
  id                       uuid primary key default gen_random_uuid(),
  department_id            uuid not null references public.department(id) on delete cascade,
  term_id                  uuid not null references public.academic_term(id),
  name                     text not null,
  status                   profile_status not null default 'draft',
  copied_from_profile_id   uuid references public.profile(id) on delete set null,
  created_at               timestamptz not null default now(),
  unique (department_id, term_id)                              -- invariant 2: หนึ่ง profile ต่อแผนกต่อภาคเรียน
);

create table if not exists public.source_upload (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profile(id) on delete cascade,
  program_id         uuid not null references public.program(id),
  format_id          uuid references public.curriculum_format(id),
  og_file            text not null,                            -- ไฟล์ตามที่อัปโหลด ห้ามแก้ (invariant 8)
  normalised_file    text,
  curriculum_version text,
  uploaded_at        timestamptz not null default now()
);

create table if not exists public.year_plan (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profile(id) on delete cascade,
  program_id       uuid not null references public.program(id),
  source_upload_id uuid references public.source_upload(id),  -- invariant 1: อ่านจากเวอร์ชันหลักสูตรเดียว
  year             int not null check (year between 1 and 8),
  state            year_plan_state not null default 'not_started',
  unique (profile_id, program_id, year)
);

create table if not exists public.student_group (
  id           uuid primary key default gen_random_uuid(),
  year_plan_id uuid not null references public.year_plan(id) on delete cascade,
  name         text not null,
  size         int not null default 0 check (size >= 0),       -- จำนวนที่นั่งที่ต้องใช้ ไม่ใช่ข้อมูลนักศึกษา (invariant 12)
  unique (year_plan_id, name)
);

create table if not exists public.plan_row (
  id           uuid primary key default gen_random_uuid(),
  year_plan_id uuid not null references public.year_plan(id) on delete cascade,
  course_id    uuid references public.course(id),             -- null ได้ถ้าเป็นช่องเลือก
  term_no      int not null check (term_no between 1 and 3),
  is_red       boolean not null default false,                -- แถวที่ระบบสงสัย ต้องตรวจ
  red_reason   text,
  pdf_page     int check (pdf_page > 0)
);
create index if not exists plan_row_yp_idx on public.plan_row (year_plan_id);

create table if not exists public.elective_slot (
  plan_row_id      uuid primary key references public.plan_row(id) on delete cascade,
  mode             elective_mode not null,
  chosen_course_id uuid references public.course(id)
);

-- ───────────────────────── 5. เวลาว่าง ─────────────────────────
create table if not exists public.teacher_term_setting (
  user_id          uuid not null references public.users(id) on delete cascade,
  term_id          uuid not null references public.academic_term(id) on delete cascade,
  max_hours_per_day int not null check (max_hours_per_day between 1 and 12),
  primary key (user_id, term_id)
);

-- เก็บเฉพาะคาบที่ "ไม่ว่าง" (busy = true); ผูกคน × ภาคเรียน ใช้ร่วมทุกแผนก (invariant 3)
create table if not exists public.availability_slot (
  user_id  uuid not null references public.users(id) on delete cascade,
  term_id  uuid not null references public.academic_term(id) on delete cascade,
  weekday  int not null check (weekday between 1 and 7),       -- 1 = จันทร์
  period   int not null check (period between 1 and 20),
  busy     boolean not null default true,
  primary key (user_id, term_id, weekday, period)
);

create table if not exists public.subject_preference (
  user_id       uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.department(id) on delete cascade,
  course_id     uuid not null references public.course(id) on delete cascade,
  rank          int not null check (rank > 0),
  primary key (user_id, department_id, course_id)
);

create table if not exists public.round (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on delete cascade,
  deadline   timestamptz not null,
  state      round_state not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.round_response (
  round_id     uuid not null references public.round(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  status       response_status not null,
  submitted_at timestamptz not null default now(),
  filled_by    uuid references public.users(id),               -- ใช้เมื่อ status = filled_by_head
  reminded_at  timestamptz,
  primary key (round_id, user_id)
);

-- ───────────────────────── 6. ปัญหา / รัน solver / ตาราง ─────────────────────────
create table if not exists public.issue (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profile(id) on delete cascade,
  severity      issue_severity not null,
  kind          text not null,
  about_user_id uuid references public.users(id) on delete set null,
  course_id     uuid references public.course(id) on delete set null,
  summary       text,
  state         issue_state not null default 'open',
  created_at    timestamptz not null default now()
);
create index if not exists issue_profile_idx on public.issue (profile_id, state);

create table if not exists public.comment (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issue(id) on delete cascade,
  author_id  uuid not null references public.users(id),
  body       text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

create table if not exists public.decision (
  issue_id   uuid primary key references public.issue(id) on delete cascade,  -- invariant 6
  decided_by uuid not null references public.users(id),
  outcome    decision_outcome not null,
  note       text not null default '',
  decided_at timestamptz not null default now()
);

create table if not exists public.rule_setting (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on delete cascade,
  rule_key   text not null,
  kind       rule_kind not null,
  weight     int not null default 1 check (weight >= 0),
  enabled    boolean not null default true,
  unique (profile_id, rule_key)
);

create table if not exists public.precheck_report (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profile(id) on delete cascade,
  result          precheck_result not null,
  details         jsonb not null default '[]',
  acknowledged_by uuid references public.users(id),
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  check ((acknowledged_by is null) = (acknowledged_at is null))
);

create table if not exists public.generation_run (
  id           uuid primary key default gen_random_uuid(),
  precheck_id  uuid not null references public.precheck_report(id),
  year_plan_id uuid references public.year_plan(id),           -- null = ทั้งโปรไฟล์
  status       run_status not null default 'queued',
  duration_ms  int check (duration_ms >= 0),
  created_at   timestamptz not null default now()
);

create table if not exists public.candidate (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.generation_run(id) on delete cascade,
  quality_score double precision,
  fully_placed  boolean not null default false
);

create table if not exists public.timetable_version (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profile(id) on delete cascade,
  from_candidate_id uuid references public.candidate(id) on delete set null,
  version_no        int not null check (version_no > 0),
  state             profile_status not null default 'draft',
  published_at      timestamptz,
  published_by      uuid references public.users(id),
  created_at        timestamptz not null default now(),
  unique (profile_id, version_no),
  check ((state = 'published') = (published_at is not null and published_by is not null))
);
create unique index if not exists timetable_one_published on public.timetable_version (profile_id) where state = 'published';

-- weekday/period เป็น null = คาบที่ยังไม่ลง (ถาด "ยังไม่ลง") พร้อมเหตุผลและวิธีแก้
create table if not exists public.scheduled_class (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.timetable_version(id) on delete cascade,
  plan_row_id     uuid not null references public.plan_row(id),
  group_id        uuid not null references public.student_group(id),
  teacher_id      uuid references public.users(id),
  room_id         uuid references public.room(id),
  weekday         int check (weekday between 1 and 7),
  period          int check (period between 1 and 20),
  pinned          boolean not null default false,
  unplaced_reason text,
  unplaced_fix    text,
  check ((weekday is null) = (period is null)),
  -- invariant 4: ไม่มีการชนแบบ hard; deferrable เพื่อให้สลับคาบสองแถวใน transaction เดียวได้
  constraint sc_teacher_clash unique (version_id, teacher_id, weekday, period) deferrable initially deferred,
  constraint sc_room_clash    unique (version_id, room_id,    weekday, period) deferrable initially deferred,
  constraint sc_group_clash   unique (version_id, group_id,   weekday, period) deferrable initially deferred
);
create index if not exists sc_version_idx on public.scheduled_class (version_id);

-- invariant 11: ห้องหนึ่งจองซ้ำไม่ได้ในภาคเดียวกัน (ข้ามแผนก) — term_id เพิ่มจาก ER เพื่อให้ PK ครอบภาคเรียน
create table if not exists public.room_booking (
  room_id       uuid not null references public.room(id) on delete cascade,
  term_id       uuid not null references public.academic_term(id) on delete cascade,
  weekday       int not null check (weekday between 1 and 7),
  period        int not null check (period between 1 and 20),
  version_id    uuid not null references public.timetable_version(id) on delete cascade,
  department_id uuid not null references public.department(id),
  primary key (room_id, term_id, weekday, period)
);

create table if not exists public.change_request (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.timetable_version(id) on delete cascade,
  requested_by  uuid not null references public.users(id),
  class_id      uuid not null references public.scheduled_class(id) on delete cascade,
  reason        text not null,
  impact        text,
  status        request_status not null default 'waiting',
  decision_note text,
  created_at    timestamptz not null default now()
);

create table if not exists public.change_log (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.timetable_version(id) on delete cascade,
  changed_by  uuid not null references public.users(id),
  request_id  uuid references public.change_request(id),      -- null = direct edit
  old_value   jsonb,
  new_value   jsonb,
  agreed_with text,
  at          timestamptz not null default now()
);

-- ───────────────────────── 7. trigger บังคับ invariants ─────────────────────────
-- (ตัวช่วยค้นหาแผนกต้องมาก่อน เพราะ trigger และ RLS ใช้ร่วม)
create or replace function public.profile_dept(p uuid) returns uuid
  language sql stable security definer set search_path = public as
  $$ select department_id from public.profile where id = p $$;
create or replace function public.version_dept(v uuid) returns uuid
  language sql stable security definer set search_path = public as
  $$ select p.department_id from public.timetable_version t join public.profile p on p.id = t.profile_id where t.id = v $$;
create or replace function public.year_plan_dept(y uuid) returns uuid
  language sql stable security definer set search_path = public as
  $$ select p.department_id from public.year_plan yp join public.profile p on p.id = yp.profile_id where yp.id = y $$;
create or replace function public.issue_dept(i uuid) returns uuid
  language sql stable security definer set search_path = public as
  $$ select p.department_id from public.issue s join public.profile p on p.id = s.profile_id where s.id = i $$;

-- ตัวช่วยสิทธิ์ (ใช้กับ auth.uid() เท่านั้น; security definer เพื่อไม่ให้ RLS วนซ้ำ)
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin from public.users where id = auth.uid()), false) $$;
create or replace function public.is_member(dep uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.is_admin() or exists (select 1 from public.membership where user_id = auth.uid() and department_id = dep) $$;
create or replace function public.is_staff(dep uuid) returns boolean   -- หัวหน้า/ผู้ช่วย (+ผู้ดูแลสถาบัน)
  language sql stable security definer set search_path = public as
  $$ select public.is_admin() or exists (select 1 from public.membership where user_id = auth.uid() and department_id = dep and role in ('HEAD','ASSISTANT')) $$;
create or replace function public.is_head(dep uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.membership where user_id = auth.uid() and department_id = dep and role = 'HEAD') $$;
create or replace function public.shares_dept(u uuid) returns boolean   -- อยู่แผนกเดียวกันกับผู้ใช้ u
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.membership a join public.membership b on a.department_id = b.department_id
                    where a.user_id = auth.uid() and b.user_id = u) $$;
create or replace function public.manages_user(u uuid) returns boolean   -- เป็นหัวหน้า/ผู้ช่วยของแผนกที่ u สังกัด
  language sql stable security definer set search_path = public as
  $$ select public.is_admin() or exists (
       select 1 from public.membership a join public.membership b on a.department_id = b.department_id
       where a.user_id = auth.uid() and a.role in ('HEAD','ASSISTANT') and b.user_id = u) $$;

-- ผู้ใช้แก้ is_admin ของตัวเองไม่ได้ (โอนสิทธิ์ทำผ่านผู้ดูแลเท่านั้น)
create or replace function public.guard_users() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() and auth.uid() is not null then
    raise exception 'เฉพาะผู้ดูแลสถาบันเปลี่ยนสิทธิ์ผู้ดูแลได้' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists users_guard on public.users;
create trigger users_guard before update on public.users for each row execute function public.guard_users();

-- สมัครผ่าน Supabase Auth แล้วสร้างแถว users ให้อัตโนมัติ (ชื่อ/ภาษามาจาก raw_user_meta_data)
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name, language)
  values (new.id, lower(new.email), coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          coalesce((new.raw_user_meta_data->>'language')::app_language, 'th'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- invariant 8: og_file ห้ามแก้
create or replace function public.guard_og_file() returns trigger language plpgsql as $$
begin
  if new.og_file is distinct from old.og_file then raise exception 'og_file แก้ไม่ได้ ให้แก้ที่ plan_row แทน'; end if;
  return new;
end $$;
drop trigger if exists source_upload_og on public.source_upload;
create trigger source_upload_og before update on public.source_upload for each row execute function public.guard_og_file();

-- invariant 6: ปิด issue ได้ด้วยการมี decision เท่านั้น
create or replace function public.guard_issue_close() returns trigger language plpgsql as $$
begin
  if new.state = 'closed' and old.state <> 'closed' and not exists (select 1 from public.decision where issue_id = new.id) then
    raise exception 'ปิดปัญหาได้เมื่อมีการตัดสินใจ (decision) เท่านั้น';
  end if;
  return new;
end $$;
drop trigger if exists issue_close_guard on public.issue;
create trigger issue_close_guard before update on public.issue for each row execute function public.guard_issue_close();

create or replace function public.close_issue_on_decision() returns trigger language plpgsql security definer set search_path = public as $$
begin update public.issue set state = 'closed' where id = new.issue_id and state <> 'closed'; return new; end $$;
drop trigger if exists decision_closes_issue on public.decision;
create trigger decision_closes_issue after insert on public.decision for each row execute function public.close_issue_on_decision();

-- invariant 5: รันได้เมื่อ precheck ถูก acknowledge แล้ว
create or replace function public.guard_run() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.precheck_report where id = new.precheck_id and acknowledged_by is not null) then
    raise exception 'ต้องรับทราบรายงานตรวจก่อนรัน (precheck ยังไม่ acknowledge)';
  end if;
  return new;
end $$;
drop trigger if exists run_guard on public.generation_run;
create trigger run_guard before insert on public.generation_run for each row execute function public.guard_run();

-- invariant 7: เผยแพร่ได้เฉพาะ HEAD ของแผนก; เผยแพร่แล้วล็อกการแก้สถานะย้อนตรง ๆ ด้วย check ด้านบน
create or replace function public.guard_publish() returns trigger language plpgsql security definer set search_path = public as $$
declare dep uuid := public.profile_dept(new.profile_id);
begin
  if new.state = 'published' and (tg_op = 'INSERT' or old.state <> 'published') then
    if not exists (select 1 from public.membership where user_id = new.published_by and department_id = dep and role = 'HEAD') then
      raise exception 'เผยแพร่ได้เฉพาะหัวหน้าแผนก';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists version_publish_guard on public.timetable_version;
create trigger version_publish_guard before insert or update on public.timetable_version for each row execute function public.guard_publish();

-- เผยแพร่แล้ว: จองห้องใหม่ทั้งชุด (ชนกับแผนกอื่น = unique violation ที่ room_booking) และสถานะ profile ตามเวอร์ชัน
create or replace function public.on_version_published() returns trigger language plpgsql security definer set search_path = public as $$
declare prof public.profile%rowtype;
begin
  if new.state = 'published' and (tg_op = 'INSERT' or old.state <> 'published') then
    select * into prof from public.profile where id = new.profile_id;
    delete from public.room_booking rb using public.timetable_version tv
      where rb.version_id = tv.id and tv.profile_id = new.profile_id;
    insert into public.room_booking (room_id, term_id, weekday, period, version_id, department_id)
      select sc.room_id, prof.term_id, sc.weekday, sc.period, new.id, prof.department_id
      from public.scheduled_class sc
      where sc.version_id = new.id and sc.room_id is not null and sc.weekday is not null;
    update public.profile set status = 'published' where id = new.profile_id;
  end if;
  return new;
end $$;
drop trigger if exists version_published_effects on public.timetable_version;
create trigger version_published_effects after insert or update on public.timetable_version for each row execute function public.on_version_published();

-- เวอร์ชันที่เผยแพร่แล้วล็อก: แก้/เพิ่ม/ลบคาบไม่ได้ (การเปลี่ยนภายหลังสร้างเวอร์ชันใหม่เสมอ)
create or replace function public.guard_locked_version() returns trigger language plpgsql as $$
declare vid uuid := coalesce(new.version_id, old.version_id);
begin
  if exists (select 1 from public.timetable_version where id = vid and state = 'published') then
    raise exception 'เวอร์ชันที่เผยแพร่แล้วแก้ไม่ได้ ให้สร้างเวอร์ชันใหม่';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists scheduled_class_lock on public.scheduled_class;
create trigger scheduled_class_lock before insert or update or delete on public.scheduled_class for each row execute function public.guard_locked_version();

-- ───────────────────────── 8. RLS + view สาธารณะ ─────────────────────────
-- หลักการ: ปิดทุกตารางเป็นค่าเริ่มต้น แล้วเปิดตามบทบาท  ผู้ดูแลสถาบัน = เห็น/แก้ทุกแผนก
-- ตารางเวลาที่เผยแพร่อ่านได้สาธารณะแบบอ่านอย่างเดียวผ่าน view public_timetable (ADR 0001) ไม่เปิดตารางจริงให้ anon
do $$
declare t text;
begin
  foreach t in array array[
    'institution','department','academic_term','holiday','room','users','membership','invite','password_reset','notification',
    'program','curriculum_format','course','profile','source_upload','year_plan','student_group','plan_row','elective_slot',
    'teacher_term_setting','availability_slot','subject_preference','round','round_response',
    'issue','comment','decision','rule_setting','precheck_report','generation_run','candidate',
    'timetable_version','scheduled_class','room_booking','change_request','change_log']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- ช่วยสร้าง policy ซ้ำได้ (drop แล้วสร้างใหม่)
create or replace procedure public._pol(tbl text, pname text, cmd text, using_expr text, check_expr text default null)
language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', pname, tbl);
  execute format('create policy %I on public.%I for %s to authenticated %s %s', pname, tbl, cmd,
    case when using_expr is not null then 'using (' || using_expr || ')' else '' end,
    case when check_expr is not null then 'with check (' || check_expr || ')' else '' end);
end $$;

-- สถาบัน/โครงสร้าง: ทุกคนที่ล็อกอินอ่านได้ เขียนเฉพาะผู้ดูแล
call public._pol('institution',   'inst_read',  'select', 'true');
call public._pol('institution',   'inst_write', 'all',    'public.is_admin()', 'public.is_admin()');
call public._pol('department',    'dept_read',  'select', 'true');
call public._pol('department',    'dept_write', 'all',    'public.is_admin()', 'public.is_admin()');
call public._pol('academic_term', 'term_read',  'select', 'true');
call public._pol('academic_term', 'term_write', 'all',    'public.is_admin()', 'public.is_admin()');
call public._pol('holiday',       'hol_read',   'select', 'true');
call public._pol('holiday',       'hol_write',  'all',    'public.is_admin()', 'public.is_admin()');
call public._pol('curriculum_format', 'fmt_read',  'select', 'true');
call public._pol('curriculum_format', 'fmt_write', 'all',    'public.is_admin()', 'public.is_admin()');
call public._pol('course', 'course_read',  'select', 'true');
call public._pol('course', 'course_write', 'all',    'public.is_admin() or exists (select 1 from public.membership where user_id = auth.uid() and role in (''HEAD'',''ASSISTANT''))',
                                                    'public.is_admin() or exists (select 1 from public.membership where user_id = auth.uid() and role in (''HEAD'',''ASSISTANT''))');

-- ห้อง: อ่านได้ทุกคน (ห้องร่วมใช้ข้ามแผนก) เขียนโดยหัวหน้า/ผู้ช่วยของแผนกนั้น; ห้องร่วมเขียนโดยผู้ดูแล
call public._pol('room', 'room_read',  'select', 'true');
call public._pol('room', 'room_write', 'all',
  'case when department_id is null then public.is_admin() else public.is_staff(department_id) end',
  'case when department_id is null then public.is_admin() else public.is_staff(department_id) end');

-- ผู้ใช้: เห็นตัวเอง คนร่วมแผนก และทุกคน (ผู้ดูแล); แก้ได้เฉพาะตัวเอง (หรือผู้ดูแล)
call public._pol('users', 'users_read',  'select', 'id = auth.uid() or public.is_admin() or public.shares_dept(id)');
call public._pol('users', 'users_self',  'update', 'id = auth.uid() or public.is_admin()', 'id = auth.uid() or public.is_admin()');
call public._pol('users', 'users_admin_insert', 'insert', null, 'public.is_admin()');

call public._pol('membership', 'mem_read',  'select', 'user_id = auth.uid() or public.is_member(department_id)');
-- หัวหน้า/ผู้ช่วยจัดการสมาชิกแผนกตนได้ แต่ตั้ง HEAD ได้เฉพาะผู้ดูแล/หัวหน้า
call public._pol('membership', 'mem_write', 'all',
  'public.is_staff(department_id)',
  'public.is_admin() or public.is_head(department_id) or (public.is_staff(department_id) and role <> ''HEAD'')');
call public._pol('invite', 'invite_all', 'all', 'public.is_staff(department_id)', 'public.is_staff(department_id)');
call public._pol('password_reset', 'reset_staff', 'all', 'public.manages_user(user_id)', 'public.manages_user(user_id) and created_by = auth.uid()');
call public._pol('notification', 'notif_own_read',   'select', 'user_id = auth.uid()');
call public._pol('notification', 'notif_own_update', 'update', 'user_id = auth.uid()', 'user_id = auth.uid()');
call public._pol('notification', 'notif_staff_send', 'insert', null, 'public.manages_user(user_id) or user_id = auth.uid()');

-- ข้อมูลตามแผนก: สมาชิกอ่าน, หัวหน้า/ผู้ช่วยเขียน
call public._pol('program', 'program_read',  'select', 'public.is_member(department_id)');
call public._pol('program', 'program_write', 'all', 'public.is_staff(department_id)', 'public.is_staff(department_id)');
call public._pol('profile', 'profile_read',  'select', 'public.is_member(department_id)');
call public._pol('profile', 'profile_write', 'all', 'public.is_staff(department_id)', 'public.is_staff(department_id)');

do $$
declare r record;
begin
  -- ตารางที่ถึงแผนกผ่าน profile_id
  for r in select * from (values
      ('source_upload','profile_id'), ('year_plan','profile_id'), ('round','profile_id'), ('issue','profile_id'),
      ('rule_setting','profile_id'), ('precheck_report','profile_id'), ('timetable_version','profile_id')) v(t, c)
  loop
    call public._pol(r.t, r.t || '_read',  'select', format('public.is_member(public.profile_dept(%I))', r.c));
    call public._pol(r.t, r.t || '_write', 'all',
      format('public.is_staff(public.profile_dept(%I))', r.c), format('public.is_staff(public.profile_dept(%I))', r.c));
  end loop;
end $$;

call public._pol('student_group', 'sg_read',  'select', 'public.is_member(public.year_plan_dept(year_plan_id))');
call public._pol('student_group', 'sg_write', 'all', 'public.is_staff(public.year_plan_dept(year_plan_id))', 'public.is_staff(public.year_plan_dept(year_plan_id))');
call public._pol('plan_row', 'pr_read',  'select', 'public.is_member(public.year_plan_dept(year_plan_id))');
call public._pol('plan_row', 'pr_write', 'all', 'public.is_staff(public.year_plan_dept(year_plan_id))', 'public.is_staff(public.year_plan_dept(year_plan_id))');
call public._pol('elective_slot', 'es_read',  'select',
  'public.is_member(public.year_plan_dept((select year_plan_id from public.plan_row where id = plan_row_id)))');
call public._pol('elective_slot', 'es_write', 'all',
  'public.is_staff(public.year_plan_dept((select year_plan_id from public.plan_row where id = plan_row_id)))',
  'public.is_staff(public.year_plan_dept((select year_plan_id from public.plan_row where id = plan_row_id)))');

-- เวลาว่างของครู: เจ้าตัวแก้ได้; หัวหน้า/ผู้ช่วยของแผนกที่ครูสังกัดอ่านและกรอกแทนได้
call public._pol('teacher_term_setting', 'tts_all', 'all', 'user_id = auth.uid() or public.manages_user(user_id)', 'user_id = auth.uid() or public.manages_user(user_id)');
call public._pol('availability_slot',    'av_all',  'all', 'user_id = auth.uid() or public.manages_user(user_id)', 'user_id = auth.uid() or public.manages_user(user_id)');
call public._pol('subject_preference',   'sp_own',  'all', 'user_id = auth.uid()', 'user_id = auth.uid()');
call public._pol('subject_preference',   'sp_staff_read', 'select', 'public.is_staff(department_id)');
call public._pol('round_response', 'rr_read', 'select',
  'user_id = auth.uid() or public.is_staff(public.profile_dept((select profile_id from public.round where id = round_id)))');
call public._pol('round_response', 'rr_write', 'all',
  'user_id = auth.uid() or public.is_staff(public.profile_dept((select profile_id from public.round where id = round_id)))',
  'user_id = auth.uid() or public.is_staff(public.profile_dept((select profile_id from public.round where id = round_id)))');

-- ปัญหา: สมาชิกคอมเมนต์ได้ หัวหน้า/ผู้ช่วยตัดสินใจได้
call public._pol('comment', 'comment_read',  'select', 'public.is_member(public.issue_dept(issue_id))');
call public._pol('comment', 'comment_write', 'insert', null, 'author_id = auth.uid() and public.is_member(public.issue_dept(issue_id))');
call public._pol('decision', 'decision_read',  'select', 'public.is_member(public.issue_dept(issue_id))');
call public._pol('decision', 'decision_write', 'all', 'public.is_staff(public.issue_dept(issue_id))', 'public.is_staff(public.issue_dept(issue_id)) and decided_by = auth.uid()');

-- รัน solver / ตาราง
call public._pol('generation_run', 'run_read',  'select', 'public.is_member(public.profile_dept((select profile_id from public.precheck_report where id = precheck_id)))');
call public._pol('generation_run', 'run_write', 'all', 'public.is_staff(public.profile_dept((select profile_id from public.precheck_report where id = precheck_id)))',
                                                       'public.is_staff(public.profile_dept((select profile_id from public.precheck_report where id = precheck_id)))');
call public._pol('candidate', 'cand_read',  'select', 'public.is_member(public.profile_dept((select p.profile_id from public.generation_run r join public.precheck_report p on p.id = r.precheck_id where r.id = run_id)))');
call public._pol('candidate', 'cand_write', 'all', 'public.is_staff(public.profile_dept((select p.profile_id from public.generation_run r join public.precheck_report p on p.id = r.precheck_id where r.id = run_id)))',
                                                   'public.is_staff(public.profile_dept((select p.profile_id from public.generation_run r join public.precheck_report p on p.id = r.precheck_id where r.id = run_id)))');
call public._pol('scheduled_class', 'sc_read',  'select', 'public.is_member(public.version_dept(version_id))');
call public._pol('scheduled_class', 'sc_write', 'all', 'public.is_staff(public.version_dept(version_id))', 'public.is_staff(public.version_dept(version_id))');
call public._pol('room_booking', 'rb_read',  'select', 'true');                       -- ทุกแผนกต้องเห็นว่าห้องร่วมถูกจองแล้ว
call public._pol('room_booking', 'rb_write', 'all', 'public.is_staff(department_id)', 'public.is_staff(department_id)');

-- ขอเปลี่ยน: ครูยื่นของตัวเอง; หัวหน้า/ผู้ช่วยพิจารณา
call public._pol('change_request', 'cr_read', 'select', 'requested_by = auth.uid() or public.is_staff(public.version_dept(version_id))');
call public._pol('change_request', 'cr_insert', 'insert', null, 'requested_by = auth.uid() and public.is_member(public.version_dept(version_id))');
call public._pol('change_request', 'cr_decide', 'update', 'public.is_staff(public.version_dept(version_id))', 'public.is_staff(public.version_dept(version_id))');
call public._pol('change_log', 'cl_read',  'select', 'public.is_member(public.version_dept(version_id))');
call public._pol('change_log', 'cl_write', 'insert', null, 'changed_by = auth.uid() and public.is_staff(public.version_dept(version_id))');

-- ตารางที่เผยแพร่แล้ว อ่านสาธารณะ (ไม่ต้องล็อกอิน) เฉพาะข้อมูลที่ต้องแสดง ไม่มีอีเมล/เบอร์ของครู
create or replace view public.public_timetable with (security_invoker = false) as
select p.id            as profile_id,
       d.name          as department,
       t.label         as term,
       v.version_no,
       sc.weekday, sc.period,
       c.code          as course_code, c.name as course_name,
       g.name          as student_group,
       u.name          as teacher,
       r.name          as room
from public.timetable_version v
join public.profile p        on p.id = v.profile_id
join public.department d     on d.id = p.department_id
join public.academic_term t  on t.id = p.term_id
join public.scheduled_class sc on sc.version_id = v.id and sc.weekday is not null
join public.plan_row pr      on pr.id = sc.plan_row_id
left join public.course c    on c.id = pr.course_id
join public.student_group g  on g.id = sc.group_id
left join public.users u     on u.id = sc.teacher_id
left join public.room r      on r.id = sc.room_id
where v.state = 'published';
revoke all on public.public_timetable from public;
grant select on public.public_timetable to anon, authenticated;

-- ดัชนีที่ RLS และหน้าจอใช้บ่อย
create index if not exists profile_dept_idx    on public.profile (department_id, term_id);
create index if not exists year_plan_prof_idx  on public.year_plan (profile_id);
create index if not exists version_prof_idx    on public.timetable_version (profile_id);
create index if not exists comment_issue_idx   on public.comment (issue_id, created_at);
create index if not exists change_req_ver_idx  on public.change_request (version_id, status);
create index if not exists change_log_ver_idx  on public.change_log (version_id, at desc);
create index if not exists availability_term_idx on public.availability_slot (term_id, user_id);

-- ───────────────────────── 9. kv (ชั่วคราว: เฉพาะ mock ของ frontend ในเครื่องพัฒนา) ─────────────────────────
-- src/api/persist.ts เก็บสถานะ mock เป็น snapshot ในตารางนี้ RLS ปิดไว้โดยตั้งใจ: anon key อ่านเขียนได้ทุกแถว
-- ห้ามใช้กับข้อมูลจริง ลบทิ้ง (drop table public.kv) เมื่อ frontend ย้ายมาใช้ตารางด้านบนแล้ว
create table if not exists public.kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kv disable row level security;
