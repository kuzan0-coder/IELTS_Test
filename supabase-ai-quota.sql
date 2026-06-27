-- =============================================================================
-- IELTS Prep — Kuota AI per user (kontrol biaya)
-- -----------------------------------------------------------------------------
-- TUJUAN: model "bayar sekali" tetap aman karena tiap user punya batas
--   pemakaian scoring AI (Writing/Speaking) per bulan. Tanpa ini, satu user
--   bisa memanggil scoring AI tanpa henti dan biaya Claude/Gemini membengkak.
--
-- CARA PAKAI:
--   1. Buka project Supabase > SQL Editor > New query.
--   2. Copy-paste SELURUH isi file ini, lalu RUN.
--   3. Di Vercel (Project Settings > Environment Variables) tambahkan:
--        SUPABASE_URL                = Project URL kamu (sama dgn config.js)
--        SUPABASE_ANON_KEY           = anon public key (sama dgn config.js)
--        SUPABASE_SERVICE_ROLE_KEY   = service_role key (RAHASIA, server-only!)
--        AI_MONTHLY_LIMIT            = 60   (opsional; default 60 scoring/bulan)
--      service_role key ada di Project Settings > API. JANGAN pernah taruh di
--      src/js/config.js atau kode browser — hanya di environment variable server.
-- =============================================================================

-- 1) Tabel pemakaian per user per bulan -------------------------------------
create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  period     text not null,                       -- format 'YYYY-MM', mis. '2026-06'
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

-- 2) Row Level Security ------------------------------------------------------
alter table public.ai_usage enable row level security;

-- User boleh MELIHAT pemakaiannya sendiri (untuk menampilkan sisa kuota).
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- Sengaja TIDAK ada policy insert/update: hanya server (service_role, yang
-- mem-bypass RLS) yang boleh menambah hitungan. Jadi user tidak bisa
-- mereset/memalsukan kuotanya sendiri dari browser.

-- 3) Fungsi atomik: cek + tambah kuota dalam satu transaksi ------------------
-- Mengembalikan allowed (boleh lanjut?), used (pemakaian setelah ini), dan
-- quota_limit. SECURITY DEFINER agar berjalan dengan hak pemilik fungsi.
create or replace function public.consume_ai_quota(p_user uuid, p_limit integer)
returns table(allowed boolean, used integer, quota_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_count  integer;
begin
  insert into public.ai_usage(user_id, period, count)
    values (p_user, v_period, 0)
    on conflict (user_id, period) do nothing;

  -- Kunci baris ini supaya panggilan paralel tidak saling balapan.
  select count into v_count
    from public.ai_usage
    where user_id = p_user and period = v_period
    for update;

  if v_count >= p_limit then
    return query select false, v_count, p_limit;
  else
    update public.ai_usage
      set count = count + 1, updated_at = now()
      where user_id = p_user and period = v_period
      returning count into v_count;
    return query select true, v_count, p_limit;
  end if;
end;
$$;

-- Hanya service_role yang boleh memanggil fungsi ini.
revoke all on function public.consume_ai_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;

-- Selesai.
