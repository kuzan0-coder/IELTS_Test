-- =============================================================================
-- IELTS Prep — Progres Materi Belajar (sinkron antar perangkat)
-- -----------------------------------------------------------------------------
-- TUJUAN: menyimpan skor kuis terbaik tiap materi per user, supaya tanda
--   "selesai" ikut pindah saat user login di HP/laptop lain. Tanpa tabel ini
--   progres tetap jalan, hanya tersimpan di perangkat (localStorage).
--
-- KEAMANAN: tiap user hanya bisa membaca & menulis barisnya sendiri (RLS).
--   Skor ini hanya untuk tampilan progres pribadi, tidak membuka fitur apa pun.
--
-- CARA PAKAI: Supabase > SQL Editor > New query > paste semua > RUN.
--   Aman dijalankan berulang kali.
-- =============================================================================

create table if not exists public.lesson_progress (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  lesson_id  text not null check (char_length(lesson_id) between 1 and 64),
  score      integer not null check (score >= 0),
  total      integer not null check (total between 1 and 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  check (score <= total)
);

alter table public.lesson_progress enable row level security;

drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own"
  on public.lesson_progress for select
  using (auth.uid() = user_id);

drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
create policy "lesson_progress_insert_own"
  on public.lesson_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
create policy "lesson_progress_update_own"
  on public.lesson_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
