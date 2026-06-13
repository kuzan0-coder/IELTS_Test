-- =============================================================================
-- IELTS Prep — Setup database Supabase
-- -----------------------------------------------------------------------------
-- CARA PAKAI:
--   1. Buka project kamu di https://supabase.com
--   2. Menu kiri: SQL Editor  ->  New query
--   3. Copy-paste SELURUH isi file ini, lalu klik RUN.
--   4. (Penting) Menu Authentication > Providers > Email:
--        - pastikan "Email" aktif.
--        - untuk testing cepat, MATIKAN "Confirm email" supaya akun baru
--          langsung bisa login tanpa harus klik link konfirmasi di email.
--   5. Menu Project Settings > API: salin "Project URL" dan "anon public" key
--      ke dalam file src/js/config.js
-- =============================================================================

-- 1) Tabel riwayat latihan -----------------------------------------------------
create table if not exists public.practice_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  skill      text not null check (skill in ('reading', 'listening', 'writing', 'speaking')),
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Index agar query "punya user ini, skill ini, urut waktu" tetap cepat.
create index if not exists practice_sessions_user_idx
  on public.practice_sessions (user_id, skill, created_at);

-- 2) Row Level Security --------------------------------------------------------
-- Tanpa ini, semua orang bisa baca data semua orang. WAJIB diaktifkan.
alter table public.practice_sessions enable row level security;

-- 3) Policy: tiap user hanya boleh menyentuh barisnya sendiri -----------------
drop policy if exists "practice_select_own" on public.practice_sessions;
create policy "practice_select_own"
  on public.practice_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "practice_insert_own" on public.practice_sessions;
create policy "practice_insert_own"
  on public.practice_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "practice_delete_own" on public.practice_sessions;
create policy "practice_delete_own"
  on public.practice_sessions for delete
  using (auth.uid() = user_id);

-- Selesai. App akan otomatis aktif mode cloud setelah config.js diisi.
