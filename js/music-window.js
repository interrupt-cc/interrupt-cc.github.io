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
  let canvas = null;   // the sky waterfall (full-page backdrop)
  let sky = null;
  let scope = null;
  let fall = null;      // vertical waterfall: emerges below the sky, falls behind the grid
  let fctx = null;
  let fallScale = null; // downscaled scratch canvas — one pass = one block-averaging
  let fsctx = null;
  let fallTicks = 0;
  let ctx2d = null;
  let sctx = null;
  let rows = [];            // { album, albumSlug, path, idx, name, el }
  let albums = [];          // { name, slug, headEl, bodyEl, indEl, rows }
  let currentPath = null;
  let lastSongPath = null;
  let running = false;
  let rafId = null;
  let tapsReady = false;
  let lan = null, ran = null;
  let lanBuf = null, ranBuf = null;
  let freqBuf = null;
  let lut = null;
  let lutColor = '';

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
      /* window body fades from solid black at the title bar to translucent
         at the bottom so the sky/grid show through underneath the list */
      #music-window {
        background: linear-gradient(to bottom,
          rgba(0, 0, 0, 0.97) 0%,
          rgba(0, 0, 0, 0.88) 45%,
          rgba(0, 0, 0, 0.55) 75%,
          rgba(0, 0, 0, 0.15) 100%);
      }
      /* No !important on top/left/transform — the drag handler positions
         the window via inline styles, exactly like the post window. */
      #music-window {
        width: 94vw; max-width: 1100px;
        top: 150px; height: calc(100vh - 170px);
        left: 3vw; transform: none;
        transition: height 0.4s ease;
      }
      /* Folded: collapse to the title bar, menu-style. Playback continues.
         height:auto collapses exactly to the header — nothing gets clipped. */
      #music-window.folded { height: auto !important; min-height: 0; }
      #music-window.folded #mw-vis,
      #music-window.folded #mw-toolbar,
      #music-window.folded #mw-list { display: none; }
      #mw-fold { cursor: pointer; font-size: 0.75rem; }
      /* The waterfall IS the sky: full-width backdrop behind the wave grid,
         from the top of the page to just below the horizon (grid line = 20vh).
         The phase scope overlays the same rect. */
      #mw-sky, #mw-scope {
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 26vh;
        z-index: 1; pointer-events: none; display: block;
      }
      /* the fall: starts where the sky ends, runs to the bottom of the page,
         behind the wave grid (z1 < horizon z2) */
      #mw-fall {
        position: fixed; left: 0;
        width: 100vw;
        z-index: 1; pointer-events: none; display: block;
      }
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
          <span class="window-title">SONICS</span>
          <span style="display: flex; gap: 6px; align-items: center;">
            <button id="mw-fold" class="hacker-btn">[ − ]</button>
            <button id="mw-close" class="hacker-btn">[ CLOSE ]</button>
          </span>
        </div>
        <div id="mw-toolbar">
          <div id="mw-now"><span class="mw-now-label">NOW_PLAYING: </span><span id="mw-now-name">—</span></div>
          <input type="text" id="mw-filter" placeholder="filter//" autocomplete="off">
        </div>
        <div id="mw-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // full-page sky canvas + phase-scope overlay on the same rect: both sit
    // between crt-media (z1) and the horizon grid (z2)
    sky = document.createElement('canvas');
    sky.id = 'mw-sky';
    document.body.appendChild(sky);
    scope = document.createElement('canvas');
    scope.id = 'mw-scope';
    document.body.appendChild(scope);
    fall = document.createElement('canvas');
    fall.id = 'mw-fall';
    // below the media images (same z, earlier in DOM) so they composite
    // between the fall and the wave grid
    const media = document.getElementById('crt-media');
    media.parentNode.insertBefore(fall, media);
    fctx = fall.getContext('2d');
    fallScale = document.createElement('canvas');
    fsctx = fallScale.getContext('2d');

    listEl = overlay.querySelector('#mw-list');
    nowEl = overlay.querySelector('#mw-now-name');
    filterEl = overlay.querySelector('#mw-filter');
    canvas = sky;
    ctx2d = canvas.getContext('2d');
    sctx = scope.getContext('2d');
    buildIndex();

    overlay.querySelector('#mw-close').addEventListener('click', closeWindow);
    overlay.querySelector('#mw-fold').addEventListener('click', () => {
      const win = overlay.querySelector('#music-window');
      const folded = win.classList.toggle('folded');
      overlay.querySelector('#mw-fold').textContent = folded ? '[ + ]' : '[ − ]';
      // folded or not, playback is untouched — the window just folds away
    });
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
      // One palette step per song: the spectral takes the advanced color,
      // the phase scope rides the next entry. No rotation while it plays.
      if (p.isPlaying && trackPath && trackPath !== lastSongPath) {
        lastSongPath = trackPath;
        if (window.HORIZON) window.HORIZON.triggerRipple();
      }
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

  let primed = false;

  function sizeCanvases() {
    // the header sits ABOVE the sky: the sky keeps its full 26vh height but
    // starts below the header, pushed down — never shrunk. the scope canvas
    // covers the same rect.
    const headerH = (document.getElementById('page-header') || {}).offsetHeight || 0;
    const w = window.innerWidth, h = Math.round(window.innerHeight * 0.26);
    if (w > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      scope.width = w; scope.height = h;
      primed = false; // a resized canvas is a blank one
    }
    sky.style.top = headerH + 'px';
    scope.style.top = headerH + 'px';

    // the fall starts where the sky ends and runs to the bottom of the page
    const fTop = headerH + h;
    const fh = Math.max(10, window.innerHeight - fTop);
    if (fall.width !== w || fall.height !== fh) {
      fall.width = w; fall.height = fh;
      fall.style.top = fTop + 'px';
      fall.style.height = fh + 'px';
      fallScale.width = Math.max(1, Math.floor(w / 10));
      fallScale.height = Math.max(1, Math.floor(fh / 10));
    }
  }

  // Cold-start history: synthesize a full-width lived-in spectrogram (per-bin
  // random walk, bass-weighted, streaky like real material) so a fresh load
  // or refresh shows a developed timeline immediately. Playback paints over it.
  function primeCanvas() {
    const w = canvas.width, h = canvas.height;
    if (!lut) buildLut(gridColor());
    const cols = Math.floor(w / COL_W);
    const vals = new Array(BINS);
    for (let r = 0; r < BINS; r++) {
      vals[r] = 30 + (1 - r / BINS) * 110 + Math.random() * 30; // bass-weighted base
    }
    for (let c = 0; c < cols; c++) {
      const x = w - (cols - c) * COL_W;
      for (let r = 0; r < BINS; r++) {
        vals[r] = Math.max(6, Math.min(255, vals[r] + (Math.random() - 0.48) * 22));
        const t = Math.pow(vals[r] / 255, 0.7);
        ctx2d.fillStyle = lut[Math.min(63, Math.floor(t * 63))];
        const yTop = h - (r + 1) * (h / BINS);
        ctx2d.fillRect(x, yTop, COL_W, h / BINS + 0.5);
      }
    }
    primed = true;
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
                  ['#00FFFF', '#FF00FF', '#FFFF00'];
  function scopeColor() {
    const cur = gridColor().toUpperCase();
    const i = PALETTE.indexOf(cur);
    return PALETTE[(i + 1) % PALETTE.length] || '#FF00FF';
  }

  // the phase figure wears the INVERSE of the scene color so it never melts
  // into the waterfall — it reads as its own artifact object in the frame
  function invertHex(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return '#' + [255 - ((n >> 16) & 255), 255 - ((n >> 8) & 255), 255 - (n & 255)]
      .map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function phaseColor() {
    return invertHex(scopeColor());
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

    // one continuous gradient column, low frequency at the bottom:
    // every row gets a color, so it reads as a proper spectrogram field
    const grad = ctx2d.createLinearGradient(0, h, 0, 0);
    for (let r = 0; r <= BINS; r++) {
      const f = FMIN * Math.pow(FMAX / FMIN, r / BINS);
      const b = Math.min(freqBuf.length - 1, Math.floor(f / nyq * freqBuf.length));
      const t = Math.pow(freqBuf[b] / 255, 0.7);
      grad.addColorStop(r / BINS, lut[Math.min(63, Math.floor(t * 63))]);
    }
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(half - 1, 0, COL_W, h);

    // The original phase stamp, drawn into the history AT the center onset:
    // its trail diverges symmetrically with the spectrum it belongs to.
    const amp = h * 0.42;
    tracePhaseShape(ctx2d, half, h / 2, amp, 256);
    ctx2d.globalAlpha = 0.55;
    ctx2d.strokeStyle = phaseColor();
    ctx2d.lineWidth = 1;                       // the trail stays a crisp drawing
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;

    fallStep();
  }

  // Vertical fall: the same spectrum pours out from behind the sky and falls
  // down the page behind the grid. As pixels fall they smear outward from
  // the center and are periodically averaged into ever-coarser blocks, so
  // deep content reads as chunky, spread-out squares.
  const FALL_ROW = 5;         // px dropped per audio tick
  const FALL_SPREAD = 0.006;  // horizontal stretch per tick (fraction of width)
  const FALL_PIXEL_EVERY = 9; // ticks between block-averaging passes
  function fallStep() {
    if (!fctx || fall.height < 10) return;
    const w = fall.width, h = fall.height;

    // fall: everything slides down
    fctx.drawImage(fall, 0, FALL_ROW);
    // smear: a stretched copy around the center bleeds outward each tick
    // (kept faint so the bands stay crisp instead of greying out)
    fctx.globalAlpha = 0.25;
    fctx.drawImage(fall, -w * FALL_SPREAD / 2, FALL_ROW, w * (1 + FALL_SPREAD), h);
    fctx.globalAlpha = 1;
    // very slow depth fade
    fctx.fillStyle = 'rgba(0,0,0,0.008)';
    fctx.fillRect(0, 0, w, h);

    // waterfall of the waterfall: the new row is the sky's fresh CENTER
    // COLUMN squashed and mirrored outward — bass at the center, spectrum
    // spreading symmetrically left and right, exactly like the sky emanates.
    // the level drives saturation/brightness, so loud passages flare vivid
    // while quiet ones recede instead of flattening into dead color
    if (lut && sky) {
      const lvl = Math.min(1, levelSm * 2.2);
      const half = Math.floor(sky.width / 2);
      fctx.save();
      fctx.translate(w / 2, 0);
      fctx.filter = `saturate(${(0.85 + lvl * 1.5).toFixed(2)}) brightness(${(0.82 + lvl * 0.6).toFixed(2)})`;
      fctx.drawImage(sky, half - 1, 0, 2, sky.height, -w / 2, 0, w / 2, FALL_ROW);
      fctx.scale(-1, 1);
      fctx.drawImage(sky, half - 1, 0, 2, sky.height, -w / 2, 0, w / 2, FALL_ROW);
      fctx.restore();
      fctx.filter = 'none';
    }

    // pixelate: average the whole canvas down, paint back nearest-neighbor.
    // every pass is cumulative, so the oldest (deepest) pixels are the
    // blockiest — averaged into big squares as they fall.
    fallTicks++;
    if (fallTicks % FALL_PIXEL_EVERY === 0) {
      fsctx.imageSmoothingEnabled = true;
      fsctx.clearRect(0, 0, fallScale.width, fallScale.height);
      fsctx.drawImage(fall, 0, 0, fallScale.width, fallScale.height);
      fctx.imageSmoothingEnabled = false;
      // re-saturate while painting back: averaging pulls colors toward grey,
      // this pushes them back out so the blocks stay vivid — and the current
      // level decides how hard, so volume keeps the colors alive
      const lvl = Math.min(1, levelSm * 2.2);
      fctx.filter = `saturate(${(1.3 + lvl * 0.9).toFixed(2)}) contrast(${(1.2 + lvl * 0.4).toFixed(2)})`;
      fctx.clearRect(0, 0, w, h);
      fctx.drawImage(fallScale, 0, 0, w, h);
      fctx.filter = 'none';
    }
  }

  // The phase figure: X = left channel now, Y = right channel delayed by a
  // delay that sweeps slowly back and forth. The same track therefore writes
  // a continuously different figure — diagonals, ellipses, rings, loops —
  // and the smoothed level scales it, so quiet passages collapse small.
  let rotPhase = 0;
  let levelSm = 0;
  let styleMorph = 0;
  function tracePhaseShape(ctx, cx, cy, amp, N) {
    rotPhase += 0.003;
    // slow draw<->color morph: 0 = hairline drawing, 1 = glowing coloring
    styleMorph = 0.5 + 0.5 * Math.sin(rotPhase * 0.35);
    let sum = 0;
    for (let i = 0; i < lanBuf.length; i += 4) {
      const m = (lanBuf[i] + ranBuf[i]) * 0.5;
      sum += m * m;
    }
    const rms = Math.sqrt(sum / (lanBuf.length / 4));
    levelSm += (rms - levelSm) * (rms > levelSm ? 0.25 : 0.04);
    const scale = (0.30 + 0.70 * Math.min(1, levelSm * 2.2)) * amp;

    // sweeping delay: half the buffer range, breathing with rotPhase
    const d = Math.floor((Math.sin(rotPhase * 0.7) * 0.5 + 0.5) * (lanBuf.length * 0.45));

    // slow drift rotation so the figure's orientation wanders too
    const cR = Math.cos(rotPhase * 0.21), sR = Math.sin(rotPhase * 0.21);

    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const bi = Math.floor((i / N) * (lanBuf.length - 1));
      const bj = Math.max(0, bi - d);
      let x = cx + lanBuf[bi] * scale;
      let y = cy - ranBuf[bj] * scale;
      const dx = x - cx, dy = y - cy;
      x = cx + dx * cR - dy * sR;
      y = cy + dx * sR + dy * cR;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
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
    const cx = w / 2, cy = h / 2, amp = h * 0.46;
    tracePhaseShape(sctx, cx, cy, amp, 720);
    sctx.strokeStyle = phaseColor();
    const m = styleMorph * styleMorph;         // biased: mostly drawing, rare swells
    sctx.lineWidth = 1.2 + 3.2 * m;            // drawing -> coloring
    sctx.shadowColor = phaseColor();
    sctx.shadowBlur = 10 * m;
    if (m > 0.5) sctx.globalCompositeOperation = 'lighter'; // coloring glows additively
    sctx.stroke();
    sctx.globalCompositeOperation = 'source-over';
    sctx.shadowBlur = 0;
  }

  function loop(ts) {
    try {
    ensureTaps();
    sizeCanvases();
    if (!primed) primeCanvas();

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
    // the phase figure lives on the sky overlay, not in the window —
    // it keeps drawing whether or not SONICS is open
    drawPhaseScope();
    } catch (e) { console.error('[MUSIC_WINDOW]', e); }
    rafId = requestAnimationFrame(loop);
  }

  /* ---------------- window lifecycle ---------------- */

  function openWindow() {
    buildDom();
    overlay.classList.add('active');
    sizeCanvases();
    running = true;
  }

  function closeWindow() {
    overlay.classList.remove('active');
    running = false;
    // the sky keeps painting: playback is the main page player's business
  }

  /* ---------------- nav + boot ---------------- */

  function wireNav() {
    const music = document.getElementById('music-link');
    if (music) music.addEventListener('click', (e) => {
      e.preventDefault();
      openWindow();
    });
  }

  function boot() {
    if (!P()) return; // no player, no window
    buildDom();
    injectTransport();
    hookPlayer();
    wireNav();
    applyHash();          // a shared deep link opens the window
    // the sky is the landing view; the window opens via [ SONICS ] or a deep link
    rafId = requestAnimationFrame(loop);  // the sky never stops
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
