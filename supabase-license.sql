-- =============================================================================
-- IELTS Prep — Lisensi pembelian (model bayar sekali)
-- -----------------------------------------------------------------------------
-- TUJUAN: menandai user yang SUDAH BAYAR. Fitur premium (AI scoring, semua
--   passage, mock test) hanya terbuka jika ada baris 'active' untuk user itu.
--
-- KEAMANAN: hanya server (service_role, lewat webhook Midtrans) yang boleh
--   menulis/menandai lunas. User TIDAK bisa menjadikan dirinya berbayar dari
--   browser — RLS hanya mengizinkan SELECT atas barisnya sendiri.
--
-- CARA PAKAI: Supabase > SQL Editor > New query > paste semua > RUN.
-- =============================================================================

create table if not exists public.licenses (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  status     text not null default 'active',     -- 'active' = sudah bayar
  plan       text not null default 'lifetime',
  order_id   text,                                -- ID order dari Midtrans
  amount     integer,                             -- nominal dibayar (Rupiah)
  paid_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.licenses enable row level security;

-- User boleh MELIHAT status lisensinya sendiri (untuk gating di UI).
drop policy if exists "licenses_select_own" on public.licenses;
create policy "licenses_select_own"
  on public.licenses for select
  using (auth.uid() = user_id);

-- Sengaja TIDAK ada policy insert/update untuk user. Hanya service_role
-- (webhook pembayaran di server) yang menulis ke tabel ini.

-- -----------------------------------------------------------------------------
-- UNTUK TESTING: beri dirimu sendiri lisesni "berbayar" tanpa benar-benar bayar.
-- Ganti EMAIL di bawah dengan email akunmu, lalu jalankan baris ini saja.
-- (Hapus / jangan pakai di produksi.)
-- -----------------------------------------------------------------------------
-- insert into public.licenses (user_id, status, plan, paid_at)
-- select id, 'active', 'lifetime', now() from auth.users
--   where email = 'zanfau53@gmail.com'
-- on conflict (user_id) do update set status = 'active', paid_at = now();
