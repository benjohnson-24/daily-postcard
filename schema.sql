-- ============================================================
-- Daily Postcard — run this once in Supabase
-- Dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================

create table if not exists public.entries (
  id         bigint generated always as identity primary key,
  date       date        not null,
  name       text        not null,
  answer     text        not null,
  question   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One answer per person per day. Re-submitting UPDATES the
  -- existing row instead of adding a duplicate.
  constraint entries_date_name_key unique (date, name)
);

-- Keep updated_at honest on re-submits.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- The app has no login, so the public "anon" key must be able
-- to read, write, and edit. It deliberately CANNOT delete —
-- nothing can wipe your history through the website.
-- ------------------------------------------------------------

alter table public.entries enable row level security;

drop policy if exists "anon can read"   on public.entries;
drop policy if exists "anon can insert" on public.entries;
drop policy if exists "anon can update" on public.entries;

create policy "anon can read"
  on public.entries for select to anon
  using (true);

create policy "anon can insert"
  on public.entries for insert to anon
  with check (true);

create policy "anon can update"
  on public.entries for update to anon
  using (true) with check (true);

-- ============================================================
-- PHOTOS (added later — safe to re-run this whole file)
-- ============================================================

alter table public.entries add column if not exists photo text;

-- A public bucket for the attached pictures. "Public" means the
-- image URLs are readable by anyone who has them — same trade
-- you already made by having no login on the site itself.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "anon can view photos"    on storage.objects;
drop policy if exists "anon can upload photos"  on storage.objects;
drop policy if exists "anon can replace photos" on storage.objects;

create policy "anon can view photos"
  on storage.objects for select to anon
  using (bucket_id = 'photos');

create policy "anon can upload photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'photos');

create policy "anon can replace photos"
  on storage.objects for update to anon
  using (bucket_id = 'photos') with check (bucket_id = 'photos');

-- ============================================================
-- TIMESTAMPS ON POSTCARDS (added later — safe to re-run)
-- ============================================================

-- When the entry was sealed. Shown on the polaroid's white strip,
-- or under the handwriting when there's no photo.
alter table public.entries add column if not exists at timestamptz;

-- ============================================================
-- REACTIONS + REPLIES (added later — safe to re-run)
-- ============================================================

-- One row per (day, whose answer, who's reacting). The emoji set
-- is stored as a single string and rewritten on every change, so
-- reactions can be added and taken away without a delete policy.
create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  date        date        not null,
  target_name text        not null,   -- whose answer is being reacted to
  author_name text        not null,   -- who is reacting
  emojis      text        not null default '',
  updated_at  timestamptz not null default now(),
  constraint reactions_key unique (date, target_name, author_name)
);

-- Replies are append-only: one row each, oldest first.
create table if not exists public.replies (
  id          bigint generated always as identity primary key,
  date        date        not null,
  target_name text        not null,
  author_name text        not null,
  body        text        not null,
  at          timestamptz not null default now()
);

create index if not exists replies_lookup on public.replies (date, target_name);

alter table public.reactions enable row level security;
alter table public.replies   enable row level security;

drop policy if exists "anon reads reactions"   on public.reactions;
drop policy if exists "anon adds reactions"    on public.reactions;
drop policy if exists "anon edits reactions"   on public.reactions;
drop policy if exists "anon reads replies"     on public.replies;
drop policy if exists "anon adds replies"      on public.replies;

create policy "anon reads reactions"
  on public.reactions for select to anon using (true);
create policy "anon adds reactions"
  on public.reactions for insert to anon with check (true);
create policy "anon edits reactions"
  on public.reactions for update to anon using (true) with check (true);

create policy "anon reads replies"
  on public.replies for select to anon using (true);
create policy "anon adds replies"
  on public.replies for insert to anon with check (true);
