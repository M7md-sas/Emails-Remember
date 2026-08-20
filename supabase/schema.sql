-- ===========================================================================
--  دفتر الهويات — المخطط الكامل
--  يُنفَّذ مرة واحدة على مشروع Supabase جديد من محرّر SQL في لوحة التحكم.
--  آمن لإعادة التنفيذ: كل شيء مكتوب بصيغة "أنشئ إن لم يكن موجوداً".
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
--  دالة مشتركة: كل تعديل يضبط الطابع الزمني من ساعة الخادم لا من ساعة الجهاز.
--  هذا مقصود — مؤشّر المزامنة يعتمد عليه، وساعات الأجهزة قد تكون مغلوطة.
-- ---------------------------------------------------------------------------
-- مسار البحث مثبّت على الفاضي عمداً حتى لا يُخطف عبر مخطط يسبقه في المسار
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
--  الجداول
-- ===========================================================================

-- الهويات: القاعدة الثابتة. تُكتب مرة وتُورَّث على كل حساب مربوط بها.
create table if not exists public.identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  color       text not null default '#6b7280',
  why         text,
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- الخدمات: الكيان الواحد الذي له عدة أسماء وعناوين.
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  note        text,
  last_opened_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- المرادفات: نطاق، أو اسم تطبيق جوال، أو اسم عربي. البحث يمشي عليها كلها.
create table if not exists public.service_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  alias       text not null,
  kind        text not null default 'name'
              check (kind in ('domain','app','name')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- الحسابات: السجل الفعلي لما استُعمل. لا يوجد فيه ولن يوجد أي عمود لكلمة مرور.
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  identity_id   uuid references public.identities(id) on delete set null,
  email         text,
  username      text,
  login_method  text not null default 'email'
                check (login_method in ('email','google','apple','phone','other')),
  status        text not null default 'active'
                check (status in ('active','closed','to_migrate')),
  note          text,
  source        text not null default 'manual'
                check (source in ('imported','manual')),
  confidence    text not null default 'confirmed'
                check (confidence in ('imported','confirmed')),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ===========================================================================
--  المشغّلات
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['identities','services','service_aliases','accounts'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before insert or update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ===========================================================================
--  الفهارس — المزامنة تسحب حسب updated_at، فهو أهم فهرس عندنا
-- ===========================================================================
create index if not exists idx_identities_sync      on public.identities (user_id, updated_at);
create index if not exists idx_services_sync        on public.services (user_id, updated_at);
create index if not exists idx_aliases_sync         on public.service_aliases (user_id, updated_at);
create index if not exists idx_accounts_sync        on public.accounts (user_id, updated_at);
create index if not exists idx_aliases_service      on public.service_aliases (service_id);
create index if not exists idx_accounts_service     on public.accounts (service_id);
create index if not exists idx_accounts_identity    on public.accounts (identity_id);

-- ===========================================================================
--  عزل الصفوف — كل جدول مقفل على صاحبه، وسياسة واحدة تكفي
--  auth.uid() ملفوفة في select عمداً فتُقيَّم مرة للاستعلام لا مرة لكل صف
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['identities','services','service_aliases','accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
       for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ===========================================================================
--  جدول النبض — مهمة يومية تكتب فيه صفاً واحداً فيظل المشروع نشطاً
--  مفتوح للدور المجهول عمداً، ولا يحمل أي بيان شخصي إطلاقاً.
-- ===========================================================================
create table if not exists public.heartbeat (
  id       integer primary key default 1 check (id = 1),
  beat_at  timestamptz not null default now(),
  beats    bigint not null default 0
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

drop policy if exists heartbeat_read  on public.heartbeat;
drop policy if exists heartbeat_write on public.heartbeat;

create policy heartbeat_read  on public.heartbeat
  for select to anon, authenticated using (true);

create policy heartbeat_write on public.heartbeat
  for update to anon, authenticated using (true) with check (true);
