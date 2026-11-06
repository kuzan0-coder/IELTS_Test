/* =========================================================================
   band-calculator.js — kalkulator band IELTS (halaman publik, tanpa login).
   Tabel konversi = tabel perkiraan yang umum dipakai untuk latihan.
   Format baris: [minimal jawaban benar, band], urut dari band tertinggi.
   ========================================================================= */
(function () {
  const TABLES = {
    listening: {
      label: 'Listening',
      rows: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6],
        [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]]
    },
    academic: {
      label: 'Reading Academic',
      rows: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6],
        [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]]
    },
    general: {
      label: 'Reading General Training',
      rows: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6],
        [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5]]
    }
  };
  const COMMON_TARGET = 6.5;

  const fmt = (b) => b.toFixed(1);

  // Pembulatan overall IELTS: <.25 turun, .25–<.75 jadi .5, >=.75 naik.
  function roundOverall(avg) {
    const whole = Math.floor(avg);
    const frac = avg - whole;
    if (frac < 0.25) return whole;
    if (frac < 0.75) return whole + 0.5;
    return whole + 1;
  }

  function cefr(band) {
    if (band >= 8.5) return 'C2';
    if (band >= 7) return 'C1';
    if (band >= 5.5) return 'B2';
    if (band >= 4) return 'B1';
    return 'A2 atau di bawahnya';
  }

  // ---- Tabs ---------------------------------------------------------------
  const tabs = Array.from(document.querySelectorAll('.calc-tab'));
  function selectTab(id, focus) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll('.calc-panel').forEach((p) => { p.hidden = p.id !== 'panel-' + id; });
    history.replaceState(null, '', '#' + id);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.dataset.tab, true);
    });
  });
  const initial = location.hash.slice(1);
  selectTab(tabs.some((t) => t.dataset.tab === initial) ? initial : 'overall');

  // ---- Overall ------------------------------------------------------------
  const DEFAULTS = { l: 6.5, r: 6, w: 6, s: 6.5 };
  const selects = {};
  Object.keys(DEFAULTS).forEach((k) => {
    const sel = document.getElementById('ov-' + k);
    for (let b = 9; b >= 1; b -= 0.5) {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = fmt(b);
      if (b === DEFAULTS[k]) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', updateOverall);
    selects[k] = sel;
  });

  function updateOverall() {
    const vals = Object.keys(selects).map((k) => parseFloat(selects[k].value));
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const band = roundOverall(avg);
    document.getElementById('ov-band').textContent = fmt(band);
    document.getElementById('ov-title').textContent = `Overall band ${fmt(band)} · setara CEFR ${cefr(band)}`;
    document.getElementById('ov-desc').textContent =
      `Rata-rata (${vals.map(fmt).join(' + ')}) ÷ 4 = ${Number(avg.toFixed(3))} → dibulatkan menjadi ${fmt(band)}.`;
  }
  updateOverall();

  // ---- Listening / Reading ------------------------------------------------
  document.querySelectorAll('.calc-panel[data-raw]').forEach((panel) => {
    const id = panel.dataset.raw;
    const { label, rows } = TABLES[id];
    const lowest = rows[rows.length - 1][0];

    const tableRows = rows.map(([min, band], i) => {
      const max = i === 0 ? 40 : rows[i - 1][0] - 1;
      return `<tr><td>${min === max ? min : `${min}–${max}`}</td><td>${fmt(band)}</td></tr>`;
    }).join('') + `<tr><td>0–${lowest - 1}</td><td>di bawah 2.5</td></tr>`;

    panel.innerHTML = `
      <div class="calc-field">
        <label for="raw-${id}">Jumlah jawaban benar ${label} (dari 40)</label>
        <div class="calc-raw">
          <input type="range" min="0" max="40" step="1" value="30" aria-label="Geser jumlah jawaban benar">
          <input type="number" id="raw-${id}" min="0" max="40" step="1" value="30" inputmode="numeric">
        </div>
      </div>
      <div class="calc-result" aria-live="polite">
        <div class="calc-band"><span>Band</span><b data-out="band">—</b></div>
        <div class="calc-result-text">
          <strong data-out="title"></strong>
          <p data-out="desc"></p>
        </div>
      </div>
      <table class="calc-table">
        <thead><tr><th>Jawaban benar</th><th>Band</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="calc-note">Tabel perkiraan ${label}. Batas nilai pada ujian sungguhan bisa sedikit berbeda antar-versi tes.</p>`;

    const range = panel.querySelector('input[type="range"]');
    const num = panel.querySelector('input[type="number"]');
    const trs = panel.querySelectorAll('tbody tr');
    const out = (k) => panel.querySelector(`[data-out="${k}"]`);
    const targetMin = (rows.find(([, b]) => b === COMMON_TARGET) || [])[0];

    function update(v) {
      v = Math.max(0, Math.min(40, Math.round(v)));
      range.value = v;
      const idx = rows.findIndex(([min]) => v >= min);
      const band = idx >= 0 ? rows[idx][1] : null;
      out('band').textContent = band === null ? '<2.5' : fmt(band);
      out('title').textContent = `${v}/40 benar ≈ band ${band === null ? 'di bawah 2.5' : fmt(band)}`;

      let desc;
      if (idx === 0) {
        desc = 'Skor tertinggi — band 9.0!';
      } else {
        const [nextMin, nextBand] = idx === -1 ? rows[rows.length - 1] : rows[idx - 1];
        desc = `Butuh ${nextMin - v} jawaban benar lagi untuk band ${fmt(nextBand)}.`;
        if (targetMin && (band === null || band < COMMON_TARGET)) {
          desc += ` Band ${fmt(COMMON_TARGET)} (syarat umum banyak universitas) butuh minimal ${targetMin}/40.`;
        }
      }
      out('desc').textContent = desc;
      trs.forEach((tr, i) => tr.classList.toggle('on', i === (idx === -1 ? rows.length : idx)));
    }

    range.addEventListener('input', () => { num.value = range.value; update(+range.value); });
    num.addEventListener('input', () => { if (num.value !== '') update(+num.value); });
    num.addEventListener('change', () => { update(+num.value || 0); num.value = range.value; });
    update(30);
  });
})();
