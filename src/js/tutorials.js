/* =========================================================================
   tutorials.js — renders curated YouTube tutorials from data/tutorials.json.

   Each video can be:
     • { youtubeId: "XXXX" }  -> embedded player (privacy-friendly nocookie)
     • { search: "kata kunci" } -> card that opens a YouTube search
   ========================================================================= */
(function () {
  const root = document.getElementById('tutorials-root');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function videoCard(v) {
    const title = esc(v.title || 'Tutorial');
    const channel = v.channel ? `<div class="t-channel">📺 ${esc(v.channel)}</div>` : '';
    const desc = v.desc ? `<div class="t-desc">${esc(v.desc)}</div>` : '';

    // (a) Embedded player.
    if (v.youtubeId) {
      const id = encodeURIComponent(v.youtubeId);
      return `<div class="tutorial-card">
        <div class="tutorial-thumb">
          <iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${id}"
            title="${title}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <div class="tutorial-body">
          <div class="t-title">${title}</div>${channel}${desc}
        </div>
      </div>`;
    }

    // (b) Search link-out card.
    const q = encodeURIComponent(v.search || v.title || 'IELTS');
    const href = `https://www.youtube.com/results?search_query=${q}`;
    return `<a class="tutorial-card" href="${href}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block">
      <div class="tutorial-thumb" style="display:grid;place-items:center;background:var(--gradient)">
        <span style="font-size:46px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))">▶️</span>
      </div>
      <div class="tutorial-body">
        <div class="t-title">${title}</div>${channel}${desc}
        <div style="margin-top:8px"><span class="tag-pill">Cari di YouTube ↗</span></div>
      </div>
    </a>`;
  }

  function sectionBlock(sec) {
    const cards = (sec.videos || []).map(videoCard).join('');
    return `<div class="tutorial-section">
      <div class="tutorial-section-head">
        <span class="sec-ico">${esc(sec.icon || '🎬')}</span>
        <h3>${esc(sec.title || sec.skill || 'Tutorial')}</h3>
      </div>
      <div class="tutorial-grid">${cards}</div>
    </div>`;
  }

  async function load() {
    try {
      const res = await fetch('data/tutorials.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const sections = (data.sections || []).filter((s) => (s.videos || []).length);
      if (!sections.length) {
        root.innerHTML = '<div class="empty-state"><div class="empty-ico">🎬</div><p>Belum ada tutorial. Tambahkan di data/tutorials.json.</p></div>';
        return;
      }
      root.innerHTML = sections.map(sectionBlock).join('');
    } catch (err) {
      root.innerHTML = `<div class="card ai-box error">Gagal memuat tutorial: ${esc(err.message)}</div>`;
    }
  }

  load();
})();
