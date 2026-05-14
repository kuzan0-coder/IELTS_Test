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
- **Study Plan 12 minggu** terintegrasi
- **Tips & Tricks** semua section
- **Multi-skill progress tracking** otomatis (localStorage)
- **Dashboard** dengan tren skor per skill vs baseline

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

## Struktur file

```
ielts-app/
├── main.js                       # Electron main process + Claude API handler (desktop)
├── preload.js                    # Secure bridge ke renderer (desktop)
├── vercel.json                   # Config deploy web: output dir + clean URLs + maxDuration
├── package.json
├── .env.example                  # Template API key
├── api/
│   └── ai/
│       └── feedback.js           # Serverless function — fitur AI versi web
└── src/
    ├── index.html                # Home / dashboard
    ├── reading.html              # Reading practice
    ├── plan.html                 # Study plan 12 minggu
    ├── tips.html                 # Tips & tricks per section
    ├── styles.css
    ├── js/
    │   ├── api.js                # Shim window.ielts untuk versi web (no-op di desktop)
    │   ├── home.js
    │   └── reading.js
    └── data/
        └── reading-passages.json # Library passage
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
- [ ] Speech-to-text Whisper API (akurasi lebih tinggi dari Web Speech API)
- [ ] Export progress ke spreadsheet CSV
- [ ] Full mock test mode (4 section beruntun)
- [ ] Dark mode

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
