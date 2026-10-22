/**
 * music-window.js
 * [ MUSIC ] — the big-screen front end for the audio archive.
 *
 * The window is a controller, not a player: every click routes through
 * window.STOCHASTIC_PLAYER (the main page player). Closing the window
 * never touches playback, and the overlay is pass-through — the page
 * stays interactive behind the floating window.
 *
 * Visuals: a sticky spectral history (scrolling FFT columns) whose
 * palette follows the horizon grid's current line color, with magenta
 * hot-peaks; a stereo phase scope (L vs R Lissajous) drawn as a crisp
 * non-trailing line on its own overlay canvas.
 *
 * Deep links: #t/<album-slug>/<track-slug> cues a track, #a/<album-slug>
 * opens the library at an album.
 */
(function () {
  const slugify = (s) => s.toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let overlay = null;
  let listEl = null;
  let nowEl = null;
  let filterEl = null;
  let canvas = null;
  let scope = null;
  let ctx2d = null;
  let sctx = null;
  let rows = [];            // { album, albumSlug, path, idx, name, el }
  let albums = [];          // { name, slug, headEl, bodyEl, indEl, rows }
  let currentPath = null;
  let running = false;
  let rafId = null;
  let tapsReady = false;
  let lan = null, ran = null;
  let lanBuf = null, ranBuf = null;
  let freqBuf = null;
  let lut = null;
  let lutColor = '';
  let lastRot = 0;

  const P = () => window.STOCHASTIC_PLAYER;
  const A = () => window.STOCHASTIC_AUDIO;

  /* ---------------- styles ---------------- */

  function injectStyles() {
    if (document.getElementById('mw-styles')) return;
    const style = document.createElement('style');
    style.id = 'mw-styles';
    style.innerText = `
      #music-overlay {
        position: fixed; inset: 0; background: transparent;
        z-index: 9500; opacity: 0; pointer-events: none;
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #music-overlay.active { opacity: 1; }
      /* Pass-through overlay: the page behind (nav, feed, signal readout)
         stays fully interactive while the library floats above it. */
      #music-window { pointer-events: auto; }
      #music-window {
        width: 94vw !important; max-width: 1100px !important; height: 88vh !important;
        left: 3vw; top: 5vh; transform: none !important;
      }
      .mw-close { order: -1; }
      #mw-vis {
        position: relative; height: 150px; flex: 0 0 auto;
        border-bottom: 1px solid var(--dim-color); background: #000;
      }
      #mw-spectral, #mw-scope { width: 100%; height: 100%; display: block; }
      #mw-scope { position: absolute; inset: 0; }
      #mw-toolbar {
        display: flex; align-items: center; gap: 12px; flex: 0 0 auto;
        padding: 8px 14px; border-bottom: 1px solid var(--dim-color);
        background: rgba(0,0,0,0.9);
      }
      #mw-now {
        flex: 1; min-width: 0; font-size: 0.75rem; color: var(--accent-color);
        letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        text-shadow: 0 0 6px rgba(0, 229, 255, 0.45);
      }
      #mw-now .mw-now-label { color: var(--dim-color); text-shadow: none; }
      #mw-filter {
        flex: 0 0 200px; background: transparent; border: 1px solid var(--dim-color);
        color: var(--text-color); font-family: var(--font-family); font-size: 0.75rem;
        padding: 4px 8px; outline: none;
      }
      #mw-filter:focus { border-color: var(--accent-color); }
      #mw-list { flex: 1 1 auto; overflow-y: auto; padding-bottom: 3rem; }
      .mw-album-head {
        position: sticky; top: 0; z-index: 2;
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 12px 14px 8px; cursor: pointer; user-select: none;
        background: rgba(0, 0, 0, 0.95);
        border-bottom: 1px solid var(--dim-color);
      }
      .mw-album-head:hover .mw-album-name { color: var(--accent-color); }
      .mw-album-name { font-size: 1.05rem; color: var(--text-color); letter-spacing: 1px; }
      .mw-album-count { font-size: 0.65rem; color: var(--dim-color); letter-spacing: 2px; }
      .mw-album-body {
        max-height: 0px; overflow: hidden;
        transition: max-height 0.4s ease;
      }
      .mw-track {
        display: flex; gap: 14px; align-items: baseline;
        padding: 5px 14px; cursor: pointer; font-size: 0.95rem;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        color: var(--text-color);
      }
      .mw-track:hover { background: rgba(255, 0, 255, 0.07); color: var(--accent-color); }
      .mw-track .mw-idx { flex: 0 0 2.2em; color: var(--dim-color); font-size: 0.8rem; }
      .mw-track.playing { color: var(--accent-color); text-shadow: 0 0 8px rgba(0, 229, 255, 0.5); }
      .mw-track.playing::after { content: " ▶"; font-size: 0.7rem; }
      .mw-track.hidden { display: none; }
      .mw-album-head.hidden { display: none; }
      #sp-transport {
        margin-left: 12px; cursor: pointer; font-size: 1rem; line-height: 1;
        color: var(--accent-color); border: 1px solid var(--dim-color);
        padding: 4px 9px; user-select: none; background: transparent;
        font-family: var(--font-family);
      }
      #sp-transport:hover { border-color: var(--accent-color); box-shadow: var(--glow-shadow); }
      @media (max-width: 640px) {
        #mw-filter { flex-basis: 120px; }
        .mw-track { font-size: 0.85rem; padding: 7px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------- index + dom ---------------- */

  function buildIndex() {
    const map = (P() && P().trackMap) || window.STOCHASTIC_TRACKLIST || {};
    albums = [];
    rows = [];
    // Reverse album order: the archive reads bottom-up by request.
    const names = Object.keys(map).reverse();
    for (const album of names) {
      const albumSlug = slugify(album);
      const head = document.createElement('div');
      head.className = 'mw-album-head';
      const body = document.createElement('div');
      body.className = 'mw-album-body'; // collapsed by default
      head.innerHTML = `<span class="mw-album-name">${album.toUpperCase()}</span>` +
                       `<span class="mw-album-count">${map[album].length} TRACKS [+]</span>`;
      listEl.appendChild(head);
      listEl.appendChild(body);
      const entry = { name: album, slug: albumSlug, headEl: head, bodyEl: body,
                      indEl: head.querySelector('.mw-album-count'), rows: [], open: false };
      albums.push(entry);

      head.addEventListener('click', () => {
        const willOpen = !entry.open;
        if (willOpen) albums.forEach(a => setAlbumOpen(a, a === entry));
        else setAlbumOpen(entry, false);
        if (willOpen) history.replaceState(null, '', '#a/' + albumSlug);
      });

      map[album].forEach((path) => {
        const file = path.split('/').pop();
        const base = file.replace(/\.[a-z0-9]+$/i, '');
        const m = base.match(/^(\d+)[\s.\-_]+(.+)$/);
        const idx = m ? m[1] : '——';
        const name = m ? m[2] : base;
        const el = document.createElement('div');
        el.className = 'mw-track';
        el.innerHTML = `<span class="mw-idx">${idx}</span><span class="mw-name">${name}</span>`;
        el.addEventListener('click', async () => {
          await ensureAudio();
          setAlbumOpen(entry, true);
          P().playTrack(path);
        });
        body.appendChild(el);
        const row = { album, albumSlug, path, idx, name, el,
                      trackSlug: slugify(base) };
        rows.push(row);
        entry.rows.push(row);
      });
    }
  }

  function setAlbumOpen(entry, open) {
    if (entry.open === open) return;
    entry.open = open;
    if (open) {
      entry.bodyEl.style.maxHeight = entry.bodyEl.scrollHeight + 'px';
      entry.indEl.textContent = `${entry.rows.length} TRACKS [−]`;
    } else {
      entry.bodyEl.style.maxHeight = '0px';
      entry.indEl.textContent = `${entry.rows.length} TRACKS [+]`;
    }
  }

  function expandAlbumOf(row) {
    const entry = albums.find(a => a.slug === row.albumSlug);
    if (!entry) return;
    albums.forEach(a => setAlbumOpen(a, a === entry));
  }

  function buildDom() {
    if (overlay) return;
    injectStyles();

    overlay = document.createElement('div');
    overlay.id = 'music-overlay';
    overlay.innerHTML = `
      <div class="window" id="music-window">
        <div class="window-header" id="mw-handle">
          <button id="mw-close" class="hacker-btn mw-close">[ CLOSE ]</button>
          <span class="window-title">SONICS::LIBRARY</span>
        </div>
        <div id="mw-vis">
          <canvas id="mw-spectral"></canvas>
          <canvas id="mw-scope"></canvas>
        </div>
        <div id="mw-toolbar">
          <div id="mw-now"><span class="mw-now-label">NOW_PLAYING: </span><span id="mw-now-name">—</span></div>
          <input type="text" id="mw-filter" placeholder="filter//" autocomplete="off">
        </div>
        <div id="mw-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    listEl = overlay.querySelector('#mw-list');
    nowEl = overlay.querySelector('#mw-now-name');
    filterEl = overlay.querySelector('#mw-filter');
    canvas = overlay.querySelector('#mw-spectral');
    scope = overlay.querySelector('#mw-scope');
    ctx2d = canvas.getContext('2d');
    sctx = scope.getContext('2d');
    buildIndex();

    overlay.querySelector('#mw-close').addEventListener('click', closeWindow);
    filterEl.addEventListener('input', applyFilter);

    bindDrag(overlay.querySelector('#mw-handle'), overlay.querySelector('#music-window'));
  }

  function bindDrag(handle, win) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      const r = win.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      win.style.transform = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      win.style.left = (ox + e.clientX - sx) + 'px';
      win.style.top = (oy + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
    handle.addEventListener('touchstart', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      const r = win.getBoundingClientRect();
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; ox = r.left; oy = r.top;
      win.style.transform = 'none';
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      win.style.left = (ox + e.touches[0].clientX - sx) + 'px';
      win.style.top = (oy + e.touches[0].clientY - sy) + 'px';
    }, { passive: false });
    document.addEventListener('touchend', () => { dragging = false; });
  }

  /* ---------------- playback integration ---------------- */

  async function ensureAudio() {
    const a = A(), p = P();
    if (!a || !p) return;
    await a.init();
    if (!p.sourceRouted) { a.routePlayer(p.audioElement); p.sourceRouted = true; }
    if (!p.alienRouted && p.alienAudio.src) { a.routeAlien(p.alienAudio); p.alienRouted = true; }
    p.syncDSP();
  }

  function cueTrack(row) {
    ensureAudio().then(() => P().playTrack(row.path));
    expandAlbumOf(row);
    setNowPlaying(row);
    syncHash(row);
    highlight(row.path);
    row.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setNowPlaying(row) {
    if (nowEl) nowEl.textContent = row ? `${row.name} — ${row.album.toUpperCase()}` : '—';
  }

  function highlight(path) {
    rows.forEach(r => r.el.classList.toggle('playing', r.path === path));
  }

  function syncHash(row) {
    const h = '#t/' + row.albumSlug + '/' + row.trackSlug;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  // Deep links: #t/<album-slug>/<track-slug> cues the track; #a/<album-slug>
  // opens the library scrolled to the album.
  function applyHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h) return;
    buildDom();
    openWindow();
    if (h.startsWith('t/')) {
      const [, aSlug, tSlug] = h.split('/');
      const row = rows.find(r => r.albumSlug === aSlug && r.trackSlug === tSlug);
      if (row) { cueTrack(row); return; }
    }
    if (h.startsWith('a/')) {
      const entry = albums.find(x => x.slug === h.slice(2));
      if (entry) { setAlbumOpen(entry, true); entry.headEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  }

  /* ---------------- transport button ---------------- */

  function injectTransport() {
    const p = P();
    const root = document.getElementById('stochastic-player');
    if (!root || document.getElementById('sp-transport')) return;
    const btn = document.createElement('div');
    btn.id = 'sp-transport';
    btn.title = 'PLAY / STOP SIGNAL';
    btn.innerText = '▶';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!p) return;
      if (p.isPlaying) {
        p.audioElement.pause();
        p.isPlaying = false;
        p.updateUI();
      } else {
        await ensureAudio();
        p.togglePlay();
      }
    });
    // sit to the right of the status block, LEFT of the fold pill (top right)
    const fold = root.querySelector('#sp-fold');
    const flexRow = root.firstElementChild;
    if (fold) flexRow.insertBefore(btn, fold);
    else flexRow.appendChild(btn);
  }

  // The player calls updateUI on every state change; ride along to keep the
  // transport icon honest no matter what triggered the change.
  function hookPlayer() {
    const p = P();
    if (!p || p.__mwHooked) return;
    p.__mwHooked = true;

    const origUpdate = p.updateUI.bind(p);
    p.updateUI = function (trackPath) {
      origUpdate(trackPath);
      const btn = document.getElementById('sp-transport');
      if (btn) btn.innerText = p.isPlaying ? '■' : '▶';
      if (p.isPlaying && trackPath) {
        currentPath = trackPath;
        highlight(trackPath);
        const parts = trackPath.split('/');
        const album = parts.length > 1 ? parts[parts.length - 2] : '';
        if (nowEl) nowEl.textContent = `${parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, '')} — ${album.toUpperCase()}`;
        const row = rows.find(r => r.path === trackPath);
        if (row) { syncHash(row); expandAlbumOf(row); }
      }
    };

    const origPlay = p.playTrack.bind(p);
    p.playTrack = function (path) {
      currentPath = path;
      highlight(path);
      const row = rows.find(r => r.path === path);
      if (row) { setNowPlaying(row); syncHash(row); }
      return origPlay(path);
    };
  }

  /* ---------------- filter ---------------- */

  function applyFilter() {
    const q = (filterEl.value || '').trim().toLowerCase();
    const visiblePerAlbum = new Map();
    rows.forEach(r => {
      const hit = !q || (r.name + ' ' + r.album).toLowerCase().includes(q);
      r.el.classList.toggle('hidden', !hit);
      visiblePerAlbum.set(r.album, (visiblePerAlbum.get(r.album) || 0) + (hit ? 1 : 0));
    });
    albums.forEach(a => {
      const any = (visiblePerAlbum.get(a.name) || 0) > 0;
      a.headEl.classList.toggle('hidden', !!q && !any);
      // while filtering, matches must be visible even inside collapsed albums
      if (q && any) setAlbumOpen(a, true);
    });
  }

  /* ---------------- visualization ---------------- */

  function ensureTaps() {
    const a = A();
    if (!a || !a.ctx || !a.masterAnalyser || tapsReady) return;
    try {
      const split = a.ctx.createChannelSplitter(2);
      a.masterAnalyser.connect(split);
      lan = a.ctx.createAnalyser(); lan.fftSize = 1024; lan.smoothingTimeConstant = 0;
      ran = a.ctx.createAnalyser(); ran.fftSize = 1024; ran.smoothingTimeConstant = 0;
      split.connect(lan, 0);
      split.connect(ran, 1);
      lanBuf = new Float32Array(lan.fftSize);
      ranBuf = new Float32Array(ran.fftSize);
      freqBuf = new Uint8Array(a.masterAnalyser.frequencyBinCount);
      tapsReady = true;
    } catch (e) { /* taps are the whole show, but never fatal */ }
  }

  function sizeCanvases() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && canvas.width !== w) {
      canvas.width = w; canvas.height = h;
      scope.width = w; scope.height = h;
    }
  }

  const BINS = 72;         // vertical frequency rows in the history
  const COL_W = 2;         // px per time column
  const COL_STEP = 0.033;  // one column per ~33ms of AUDIO time (ctx clock)
  const FMIN = 40, FMAX = 16000;
  let audioCarry = 0;
  let lastClock = 0;

  // Palette follows the horizon grid's current line color; hot peaks always
  // push into the magenta zone. Rebuilt only when the grid changes color.
  function buildLut(hex) {
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const mag = [255, 0, 255];
    lut = [];
    for (let i = 0; i < 64; i++) {
      const t = Math.pow(i / 63, 0.7); // gamma boost: less faded, sooner bright
      let r, g, b;
      if (t < 0.7) {
        const k = t / 0.7;
        r = Math.round(rgb[0] * k);
        g = Math.round(rgb[1] * k);
        b = Math.round(rgb[2] * k);
      } else {
        const k = (t - 0.7) / 0.3;
        r = Math.round(rgb[0] + (mag[0] - rgb[0]) * k * 0.7 + (255 - rgb[0]) * k * 0.3);
        g = Math.round(rgb[1] * (1 - k) * 0.6);
        b = Math.round(rgb[2] + (mag[2] - rgb[2]) * k * 0.7 + (255 - rgb[2]) * k * 0.3);
      }
      lut.push(`rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`);
    }
    lutColor = hex;
  }

  function gridColor() {
    const H = window.HORIZON;
    if (!H) return '#FF00FF';
    return (H.isGradient && H.gradientColors && H.gradientColors[0]) || H.currentColor || '#FF00FF';
  }

  // The phase scope rides the NEXT color in the grid's palette cycle, so the
  // line is always offset from whatever the spectral columns are showing.
  const PALETTE = (window.HORIZON && window.HORIZON.palette) ||
                  ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00', '#FF0000', '#5555FF'];
  function scopeColor() {
    const cur = gridColor().toUpperCase();
    const i = PALETTE.indexOf(cur);
    return PALETTE[(i + 1) % PALETTE.length] || '#FF00FF';
  }

  function readTaps() {
    const a = A();
    if (!a || !a.masterAnalyser || !tapsReady) return false;
    a.masterAnalyser.getByteFrequencyData(freqBuf);
    lan.getFloatTimeDomainData(lanBuf);
    ran.getFloatTimeDomainData(ranBuf);
    return true;
  }

  // Centered symmetric waterfall: the fresh column is inserted at the exact
  // center — under the phase scope — and the past diverges outward. The
  // clock is the AudioContext clock, so the scroll rate IS the sound's rate.
  function insertCenterColumn() {
    const w = canvas.width, h = canvas.height;
    const half = Math.floor(w / 2);

    // past diverges: left half slides left, right half slides right
    ctx2d.drawImage(canvas, 0, 0, half, h, -COL_W, 0, half, h);
    ctx2d.drawImage(canvas, w - half, 0, half, h, w - half + COL_W, 0, half, h);

    // clear the fresh strip, the column lands dead center
    ctx2d.fillStyle = 'rgba(0,0,0,0.94)';
    ctx2d.fillRect(half - COL_W, 0, COL_W * 2, h);
    ctx2d.fillRect(0, 0, COL_W, h);
    ctx2d.fillRect(w - COL_W, 0, COL_W, h);

    const a = A();
    const color = gridColor();
    if (color !== lutColor || !lut) buildLut(color);
    if (!lut) return; // palette unavailable this frame; skip the column
    a.masterAnalyser.getByteFrequencyData(freqBuf);
    const nyq = a.ctx.sampleRate / 2;
    for (let r = 0; r < BINS; r++) {
      const f0 = FMIN * Math.pow(FMAX / FMIN, r / BINS);
      const f1 = FMIN * Math.pow(FMAX / FMIN, (r + 1) / BINS);
      const b0 = Math.min(freqBuf.length - 1, Math.floor(f0 / nyq * freqBuf.length));
      const b1 = Math.max(b0 + 1, Math.min(freqBuf.length, Math.ceil(f1 / nyq * freqBuf.length)));
      let peak = 0;
      for (let b = b0; b < b1; b++) if (freqBuf[b] > peak) peak = freqBuf[b];
      const t = peak / 255;
      if (t < 0.05) continue;
      ctx2d.fillStyle = lut[Math.min(63, Math.floor(t * 63))];
      const yTop = h - (r + 1) * (h / BINS);
      ctx2d.fillRect(half - 1, yTop, COL_W, h / BINS + 0.5);
    }

    // The original phase stamp, drawn into the history AT the center onset:
    // its trail diverges symmetrically with the spectrum it belongs to.
    const amp = h * 0.44;
    const cx = half, cy = h / 2;
    ctx2d.globalAlpha = 0.6;
    ctx2d.strokeStyle = scopeColor();
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    const N = 256;
    for (let i = 0; i < N; i++) {
      const x = cx + lanBuf[i] * amp;
      const y = cy - ranBuf[i] * amp;
      if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;
  }

  // Stereo Lissajous on a dedicated overlay: cleared every frame, so the
  // line never trails into the spectral history beneath it.
  function drawPhaseScope() {
    sctx.clearRect(0, 0, scope.width, scope.height);
    const w = scope.width, h = scope.height;
    // faint center crosshair for depth reference
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2);
    sctx.moveTo(w / 2, 0); sctx.lineTo(w / 2, h);
    sctx.stroke();

    if (!tapsReady) return;
    const cx = w / 2, cy = h / 2, amp = h * 0.44;
    sctx.beginPath();
    const N = 512;
    for (let i = 0; i < N; i++) {
      const x = cx + lanBuf[i] * amp;
      const y = cy - ranBuf[i] * amp;
      if (i === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y);
    }
    sctx.strokeStyle = scopeColor();
    sctx.lineWidth = 2;
    sctx.shadowColor = scopeColor();
    sctx.shadowBlur = 6;
    sctx.stroke();
    sctx.shadowBlur = 0;
  }

  function loop(ts) {
    try {
    if (!running) return;
    ensureTaps();
    sizeCanvases();

    // pace columns by the audio clock: FFT scroll rate == sound rate
    const a = A();
    const nowT = (a && a.ctx && a.ctx.state === 'running') ? a.ctx.currentTime : (ts / 1000);
    if (!lastClock) lastClock = nowT;
    let delta = nowT - lastClock;
    lastClock = nowT;
    if (delta < 0 || delta > 1.0) delta = COL_STEP; // clock swap / tab throttle
    audioCarry += delta;

    let guard = 0;
    while (audioCarry >= COL_STEP && guard < 4) {
      if (readTaps()) insertCenterColumn();
      audioCarry -= COL_STEP;
      guard++;
    }
    if (audioCarry > COL_STEP * 8) audioCarry = 0;
    drawPhaseScope();

    // Palette rotation: nudge the horizon grid through its color cycle while
    // the signal plays, so the spectral palette and the grid lines drift
    // through the palette zones together.
    if (P() && P().isPlaying) {
      if (!lastRot) lastRot = ts;
      if (ts - lastRot > 9000) {
        lastRot = ts;
        if (window.HORIZON) window.HORIZON.triggerRipple();
      }
    } else {
      lastRot = 0;
    }
    } catch (e) { console.error('[MUSIC_WINDOW]', e); }
    rafId = requestAnimationFrame(loop);
  }

  /* ---------------- window lifecycle ---------------- */

  function openWindow() {
    buildDom();
    overlay.classList.add('active');
    sizeCanvases();
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(loop);
    }
  }

  function closeWindow() {
    overlay.classList.remove('active');
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    // playback is the main page player's business; the window just leaves
  }

  /* ---------------- nav + boot ---------------- */

  function wireNav() {
    const music = document.getElementById('music-link');
    if (music) music.addEventListener('click', (e) => {
      e.preventDefault();
      openWindow();
    });
    const devlog = document.getElementById('devlog-link');
    if (devlog) devlog.addEventListener('click', (e) => {
      e.preventDefault();
      closeWindow();
      const feed = document.querySelector('.feed');
      if (feed) feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function boot() {
    if (!P()) return; // no player, no window
    buildDom();
    injectTransport();
    hookPlayer();
    wireNav();
    applyHash();          // a shared deep link wins over the default view
    if (!location.hash) openWindow();  // music page by default on page load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
