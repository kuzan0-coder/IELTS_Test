# IELTS Prep — Desktop & Web App

Aplikasi persiapan IELTS, dibuat khusus untuk Fauzan.
Target: Band 6.5. Mulai dari module Reading.

Bisa dijalankan **2 cara**:
- **Desktop** (Electron) — `npm start`
- **Web** (Vercel) — di-deploy jadi URL publik, lihat bagian [Deploy ke web](#deploy-ke-web-vercel)

## Fitur saat ini

**4 module lengkap:**

- **📖 Reading** — 2 passage IELTS-style (Vertical Farming, Octopus Color Vision)
  - Timer 20 menit per passage, 13 soal
  - T/F/NG, Multiple Choice, Gap Fill
  - AI explanation on-demand untuk tiap jawaban salah

- **🎧 Listening** — 1 full test (4 section, 40 soal)
  - Audio pakai browser TTS (gratis, offline)
  - Multi-voice dialog (Section 1, 3) & monolog (Section 2, 4)
  - Pause/resume/restart audio

- **✍️ Writing** — Task 1 (chart/table) & Task 2 (essay)
  - 2 prompt Task 1, 4 prompt Task 2
  - Live word counter, timer 20/40 menit
  - **AI band scoring** per kriteria IELTS (TR, CC, LR, GRA)
  - Contoh perbaikan kalimat dari Claude

- **🗣️ Speaking** — Part 1, 2, 3
  - 10 topik total
  - Rekam suara via browser MediaRecorder
  - **Live transkripsi** otomatis (Web Speech API, gratis)
  - AI feedback per kriteria IELTS

**Plus:**
- **🔐 Login & akun cloud** (Supabase) — riwayat & skor tersimpan aman + sinkron antar perangkat (HP, laptop). Lihat [Login & cloud](#login--sinkronisasi-cloud-supabase).
- **📊 Halaman History** — semua sesi latihan dalam satu tempat, bisa difilter per skill.
- **▶️ Tutorial** — video YouTube terkurasi per skill, mudah diubah lewat `src/data/tutorials.json`.
- **🌙 Dark mode** — tombol ganti tema terang/gelap di sidebar (ingat pilihan terakhir).
- **Study Plan 12 minggu** terintegrasi
- **Tips & Tricks** semua section
- **Multi-skill progress tracking** otomatis (cloud kalau login, localStorage kalau tidak)
- **Dashboard** dengan tren skor per skill vs baseline

> **Belum setup Supabase?** Tidak masalah — app tetap jalan dalam **mode lokal**
> (tanpa login, data di perangkat) sampai kamu mengisi `src/js/config.js`.

## Cara menjalankan

### 1. (Opsional tapi disarankan) Setup Claude API key untuk fitur AI

1. Buka https://console.anthropic.com/
2. Daftar dan deposit minimal $5 (cukup untuk berbulan-bulan latihan)
3. Buat API key baru
4. Copy file `.env.example` jadi `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
5. Edit `.env`, ganti `sk-ant-your-key-here` dengan API key kamu

> Tanpa API key, app tetap jalan — cuma tombol "Jelaskan dengan AI" tidak berfungsi. Penjelasan default tetap ada di tiap soal.

### 2. Jalankan app

```powershell
npm start
```

Atau dengan dev tools terbuka:
```powershell
npm run dev
```

## Deploy ke web (Vercel)

Versi web memakai struktur yang sama — folder `src/` dilayani sebagai file statis,
dan fitur AI berjalan lewat **serverless function** di `api/ai/feedback.js`
(menggantikan handler `ipcMain` di `main.js`). API key disimpan di server, tidak
pernah sampai ke browser.

### 1. Push ke GitHub

```powershell
git init
git add .
git commit -m "IELTS Prep web + desktop"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

### 2. Connect ke Vercel

1. Buka https://vercel.com, login pakai akun GitHub
2. **Add New > Project**, pilih repo ini
3. Framework Preset: **Other** (jangan pilih apa pun, biarkan default)
4. Sebelum deploy, buka **Environment Variables**, tambahkan:
   - Name: `ANTHROPIC_API_KEY`
   - Value: API key kamu (`sk-ant-...`)
5. Klik **Deploy**

Setelah selesai kamu dapat URL publik (mis. `https://ielts-prep.vercel.app`).
Tiap `git push` berikutnya otomatis re-deploy.

### Tes lokal sebelum deploy (opsional)

```powershell
npm install -g vercel
vercel dev
```

Buka http://localhost:3000. `vercel dev` mensimulasikan environment Vercel
(static files + serverless function). Untuk fitur AI lokal, buat file `.env`
berisi `ANTHROPIC_API_KEY`.

> **Catatan timeout:** serverless function di-set `maxDuration: 60` detik
> (`vercel.json`). Scoring Writing/Speaking biasanya selesai 15-30 detik, jadi
> aman. Kalau pakai tier gratis dan sering timeout, pertimbangkan upgrade plan.

## Login & sinkronisasi cloud (Supabase)

Login dan penyimpanan riwayat ke cloud memakai **Supabase** (gratis untuk
pemakaian pribadi). Setup-nya sekali saja, ~10 menit:

### 1. Buat project Supabase
1. Daftar/masuk di https://supabase.com → **New project**.
2. Beri nama, pilih region terdekat (mis. Singapore), buat password database
   (boleh disimpan, jarang dipakai). Tunggu project selesai dibuat (~1 menit).

### 2. Buat tabel & aturan keamanan
1. Menu kiri **SQL Editor → New query**.
2. Buka file [`supabase-setup.sql`](supabase-setup.sql), copy **semua** isinya
   ke editor, lalu klik **Run**. Ini membuat tabel `practice_sessions` plus
   aturan Row Level Security (tiap user cuma bisa lihat datanya sendiri).

### 3. Atur metode login email
- Menu **Authentication → Providers → Email**: pastikan **Email** aktif.
- Untuk testing cepat, **matikan "Confirm email"** supaya akun baru langsung
  bisa login (tanpa harus klik link konfirmasi). Bisa diaktifkan lagi nanti.

### 4. Hubungkan app ke Supabase
1. Menu **Project Settings → API**. Salin dua nilai:
   - **Project URL** (mis. `https://abcd1234.supabase.co`)
   - **anon public** key (string panjang)
2. Buka [`src/js/config.js`](src/js/config.js) dan isi:
   ```js
   const SUPABASE_URL = 'https://abcd1234.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';   // anon public key
   ```
3. Simpan. Refresh app → sekarang muncul halaman **login**. Daftar akun, selesai!

> **Apakah aman menaruh anon key di file?** Ya. Anon key memang kunci **publik**
> yang dirancang untuk dipakai di browser. Yang menjaga data tiap user adalah
> Row Level Security di database (sudah diatur di `supabase-setup.sql`). Karena
> app ini statis (tanpa build step), inilah cara standar Supabase untuk web.

> Saat pertama kali login, riwayat lama yang tersimpan di perangkat otomatis
> dipindahkan ke cloud (hanya kalau cloud-mu masih kosong, jadi tidak dobel).

Untuk versi **web (Vercel)**: cukup `git push` seperti biasa — `config.js` ikut
ter-deploy. Tidak perlu environment variable khusus untuk Supabase (anon key
aman publik). Env var di Vercel tetap hanya untuk API key AI (`ANTHROPIC_API_KEY`).

## Struktur file

```
ielts-app/
├── main.js                       # Electron main process + Claude API handler (desktop)
├── preload.js                    # Secure bridge ke renderer (desktop)
├── vercel.json                   # Config deploy web: output dir + clean URLs + maxDuration
├── package.json
├── .env.example                  # Template API key AI (Claude/Gemini)
├── supabase-setup.sql            # SQL untuk membuat tabel + RLS di Supabase
├── api/
│   └── ai/
│       └── feedback.js           # Serverless function — fitur AI versi web
└── src/
    ├── index.html                # Home / dashboard
    ├── login.html                # Halaman login / daftar (cloud)
    ├── history.html              # Riwayat semua latihan (filter per skill)
    ├── tutorials.html            # Tutorial video YouTube per skill
    ├── reading.html / listening.html / writing.html / speaking.html / vocabulary.html
    ├── plan.html                 # Study plan 12 minggu
    ├── tips.html                 # Tips & tricks per section
    ├── styles.css                # Design system + dark mode
    ├── js/
    │   ├── config.js             # ← ISI kredensial Supabase di sini
    │   ├── auth.js               # Wrapper login/daftar/logout
    │   ├── store.js              # Lapisan data riwayat (cloud + cache lokal)
    │   ├── app-shell.js          # Bangun sidebar, auth guard, tema, migrasi data
    │   ├── theme.js              # Light/dark mode
    │   ├── api.js                # Shim window.ielts untuk versi web (no-op di desktop)
    │   ├── home.js / reading.js / listening.js / writing.js / speaking.js / vocabulary.js
    │   ├── history.js / tutorials.js / login.js
    └── data/
        ├── reading-passages.json # Library passage
        ├── listening-tests.json / writing-prompts.json / speaking-cards.json / vocabulary.json
        └── tutorials.json        # ← Daftar video tutorial (mudah diedit)
```

## Menambah passage baru

Edit `src/data/reading-passages.json`. Setiap passage butuh:
- `id`, `title`, `difficulty`, `estimatedMinutes`
- `paragraphs`: array of strings (paragraf passage)
- `questions`: array dengan field `num`, `type`, `text`, `answer`, `explanation`, `relevantPara`

Tipe soal yang didukung:
- `TFNG` — True/False/Not Given
- `MCQ` — Multiple Choice (perlu field `options`)
- `GAP` — Gap Fill (perlu `maxWords`, opsional `altAnswers`)

## Roadmap (akan ditambah bertahap)

- [x] ~~Listening module~~ ✅
- [x] ~~Writing module~~ ✅
- [x] ~~Speaking module~~ ✅
- [ ] Tambah passage Reading & test Listening
- [x] ~~Login & sinkronisasi cloud (Supabase)~~ ✅
- [x] ~~Halaman History + Tutorial YouTube~~ ✅
- [x] ~~Dark mode~~ ✅
- [ ] Speech-to-text Whisper API (akurasi lebih tinggi dari Web Speech API)
- [ ] Export progress ke spreadsheet CSV
- [ ] Full mock test mode (4 section beruntun)

## Catatan tentang materi

Passage di app ini adalah **original IELTS-style content** yang dibuat khusus, bukan scrape dari Cambridge IELTS atau website lain (untuk menghindari masalah copyright).

Untuk practice tambahan dengan soal otentik, download:
- Cambridge IELTS books 15–19 (cari PDF)
- Free sample test di https://www.ielts.org
- British Council free practice: https://takeielts.britishcouncil.org

## Troubleshooting

**"API key belum diset"** saat klik AI button:
- Pastikan file `.env` ada (bukan `.env.example`)
- Pastikan key dimulai dengan `sk-ant-`
- Restart app setelah edit `.env`

**App tidak terbuka:**
- Jalankan `npm install` ulang
- Pastikan Node.js v18+ terinstall: `node --version`

**Error `Cannot read properties of undefined (reading 'whenReady')`:**
Ini terjadi kalau environment variable `ELECTRON_RUN_AS_NODE` ter-set (biasanya di sandbox/CI). Unset dulu sebelum start:
```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

## Lisensi
MIT — bebas dipakai dan dimodifikasi.
