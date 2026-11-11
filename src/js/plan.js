/* =========================================================================
   plan.js — Study Plan: isi slot .week-lessons[data-lessons="id,id"] dengan
   link ke Materi Belajar. Judul diambil dari data/lessons.json supaya selalu
   sama dengan halaman materi; materi yang sudah selesai diberi tanda ✓.
   ========================================================================= */
(async function () {
  const slots = document.querySelectorAll('.week-lessons[data-lessons]');
  if (!slots.length) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  try {
    const { lessons } = await (await fetch('data/lessons.json')).json();
    const progress = window.LessonProgress ? await LessonProgress.load() : {};
    slots.forEach((el) => {
      const links = el.dataset.lessons.split(',')
        .map((id) => lessons.find((l) => l.id === id.trim()))
        .filter(Boolean)
        .map((l) => `<a href="materi.html?id=${encodeURIComponent(l.id)}"${progress[l.id] ? ' class="done"' : ''}>${esc(l.title)}</a>`);
      if (links.length) el.innerHTML = `<span>Materi minggu ini:</span>${links.join('')}`;
    });
  } catch (_) { /* tanpa link materi, rencana tetap terbaca */ }
})();
