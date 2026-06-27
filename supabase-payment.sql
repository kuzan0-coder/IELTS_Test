-- =============================================================================
-- IELTS Prep — Order pembayaran (Midtrans)
-- -----------------------------------------------------------------------------
-- Menyimpan tiap percobaan pembayaran agar webhook bisa memetakan order_id ->
-- user_id dengan aman. Hanya server (service_role) yang mengakses tabel ini.
--
-- CARA PAKAI: Supabase > SQL Editor > New query > paste semua > RUN.
-- (Jalankan SETELAH supabase-license.sql.)
-- =============================================================================

create table if not exists public.payment_orders (
  order_id   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  amount     integer not null,
  status     text not null default 'pending',   -- pending | paid | failed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_user_idx
  on public.payment_orders (user_id, created_at);

-- RLS aktif tanpa policy apa pun = user biasa (anon/authenticated) tidak bisa
-- mengakses. Hanya service_role (server) yang mem-bypass RLS yang boleh menulis.
alter table public.payment_orders enable row level security;

-- Selesai.
