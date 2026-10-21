/**
 * cv.js - Signal Decryption Logic for the CV_MANIFEST (v3: SHARDED VAULT)
 *
 * The manifest is gated by a hidden carrier tone whose frequency is rolled
 * per session from crypto entropy. There is no visual target, no numeric
 * readout and no greppable passphrase in this source. The ONLY feedback
 * channel is auditory: a drone whose tremolo rate carries |distance| to the
 * carrier and whose stereo pan carries the direction. A visitor tunes by ear
 * and holds resonance while a live (jittered, non-uniform) pointer stream is
 * detected. Low-frame-rate capture and static source analysis both see a
 * featureless scope.
 *
 * Key handling (v3): the passphrase ships as three tables surrounded by
 * chaff. Two fragments are consumed into a WeakMap keyed by the canvas at
 * load; the tail fragment is XOR-masked and only unmasked inside the live
 * lock handler. There is no password-taking function: the manifest decrypt
 * loop runs privately inside the gate that earned it, and the only public
 * `revealAll` left behind is poisoned - it surrenders the feeder artifact
 * and nothing else. Everything load-bearing (gate, synth, vault, chaff
 * pool) lives inside this closure; nothing global can be walked to it.
 *
 * Design limit, stated honestly: any client that can execute arbitrary JS
 * in the page can hook the decrypt call itself, and a patient source reader
 * can reimplement the assembly offline. This gate raises the cost of
 * passive reconstruction; it cannot make it impossible on static hosting.
 */
const DecryptManager = (() => {

  // --- carrier vault (generated block - paste target for tools/batch-redact.js)
  const __VAULT_TABLES = {"rA":[74,114,84,84,106,78,85,98,50,73,102],"rB":[97,82,108,53,89,88],"rC":[100,129,69,147,122,202,227,122,54],"x96":[49,67,74,106,80,108,103,114,89,78,52,74,53,48,47,102,86,106,99,82,97,99,89,111,98,114,76,60,68,104,121,117],"x97":[76,74,51,110,114,77,84,58,52,83,115,64,80,117,50,106,81,56,84,100,120,72,113,67,104,82,83],"x25":[105,117,66,110,66,76,98,122,103,83,119,106,86,101,61,122,48,89,68,88,105,79,110,48,113,50],"x92":[106,69,88,49,114,108,85,111,52,97,76,51,118,90,78,87,51,87,111,115,86,92,76,71,110],"x77":[118,74,78,81,78,66,48,68,78,55,74,97,62,108,40,77,87,105,65,114,55],"x65":[78,105,89,90,109,81,99,101,83,71,111,116,89,118,78,121,52,81,84,105,105,75,122,89,42,68],"x74":[57,119,95,107,55,71,102,48,49,109,57,52,51,120,105,112,76,54],"x67":[76,75,109,121,115,79,121,89,97,122,77,82,84,106,55,112,116,117,63,115,114,79,112],"x69":[101,85,49,50,102,56,51,78,49,73,98,110,49,110,53,108,49,104,68,75,81,72,53,57,102],"x57":[79,83,67,97,54,114,86,102,100,54,52,76,87,108,107,51,104,66,88,65,90,89,79,77,121,71,100,56],"x40":[101,64,99,106,100,110,114,53,82,66,65,50,50,99],"x91":[83,75,122,111,118,116,66,115,90,115,99,57,99,104,116,101,99,90,87,71,98,97,80,111,99,88,96,115],"x33":[82,68,120,71,107,113,76,104,86,111,77,113,35,68,49,67,101,53,90,56,118,118,88,77,57,97,120,122,48,119],"x68":[83,109,107,39,119,101,104,112,103,84,109,83,34,108,111,73,85,101,78,79,75,117,104,103,75,56,102,68,122,100,117,88,56,73],"x72":[87,116,99,77,109,38,86,121,66,118,79,45,76,82,53,65,110,49,67,113,67,99,82,82,104],"x36":[52,55,110,98,101,98,67,76,115,104,104,117,83,70,46]};
  const __VAULT_MASK = [43,211,38,244,46,179,183,55,125,128,37,168,130,114,88,208];

  const vault = new WeakMap();   // canvas element -> { a, c } (c unmasked)
  const gateRegistry = new WeakMap(); // canvas element -> live CarrierGate
  let vaultReady = false;
  let shardBHandle = null;

  function seedVault(canvas) {
    if (vaultReady || !canvas || !__VAULT_TABLES.rA) return;
    const t = __VAULT_TABLES;
    const m = __VAULT_MASK;
    const a = Uint8Array.from(t.rA);
    // The tail shard stays masked at rest. Unmasking happens inside the
    // live lock handler - the last step of the build-up, not at load.
    const maskedC = Uint8Array.from(t.rC);
    const mask = Uint8Array.from(m);
    vault.set(canvas, { a, maskedC, mask });
    // one-time handoff of the middle shard into a gate closure. The shard
    // must be materialized HERE - the module tables are burned below, and a
    // lazy read at first gate construction would find null.
    shardBHandle = (() => {
      let taken = false;
      const b = Uint8Array.from(t.rB);
      return () => {
        if (taken) return null;
        taken = true;
        return b;
      };
    })();
    // burn the readable module state: fragments survive only in the WeakMap
    t.rA = null; t.rB = null; t.rC = null;
    m.length = 0;
    vaultReady = true;
  }

  // --- runtime chaff pool -----------------------------------------------------
  // Hundreds of lookalike tables in memory, a few juicy handles on the
  // window, and the served archive bundle pulled in over the network. All
  // of it decrypts nothing; all of it looks exactly like the real material.
  const chaffPool = { tables: [] };
  function spinChaff() {
    if (chaffPool.tables.length) return;
    for (let i = 0; i < 240; i++) {
      const arr = new Uint8Array(14 + Math.floor(Math.random() * 22));
      crypto.getRandomValues(arr);
      chaffPool.tables.push(arr);
    }
    let seed = (Math.random() * 0xffffffff) >>> 0;
    const step = () => (seed = (seed * 1103515245 + 12345) >>> 0);
    window.__VAULT_HANDLE = {
      peek: () => chaffPool.tables[step() % chaffPool.tables.length],
      sync: () => step() & 0xff,
    };
    window.__ORBIT_RELAY = { drift: 0, poll: () => window.__VAULT_HANDLE.sync() };
    // Pull the archive bundle: tables scraped, never evaluated.
    fetch('chaff.js').then(r => r.text()).then(txt => {
      const re = /\[(\d{1,3}(?:\s*,\s*\d{1,3}){8,})\]/g;
      let m;
      while ((m = re.exec(txt)) !== null) {
        chaffPool.tables.push(Uint8Array.from(m[1].split(',').map(s => parseInt(s, 10) % 256)));
      }
    }).catch(() => {});
  }

  function aberration(el, finalOutput) {
    // Reveal text with a "scrambling" delay for aesthetic impact
    let iterations = 0;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';

    const interval = setInterval(() => {
      el.innerText = el.innerText
        .split('')
        .map((char, index) => {
          if (index < iterations) {
            return finalOutput[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');

      if (iterations >= finalOutput.length) {
        clearInterval(interval);
        el.innerText = finalOutput;
        el.classList.add('revealed');
      }

      iterations += 1 / 3; // Speed of the reveal
    }, 50);
  }

  // --- gate --------------------------------------------------------------------
  class CarrierGate {
    constructor(canvas, container, btn) {
      this.canvas = canvas;
      this.container = container;
      this.btn = btn;
      this.ctx2d = canvas.getContext('2d');
      this.width = canvas.width;
      this.height = canvas.height;
      this._shardB = shardBHandle ? shardBHandle() : null;

      // Session pitch band. Rolled fresh on every visit: no coordinate,
      // screenshot or captured audio from a previous session helps.
      this.fLo = 500 + Math.random() * 120;          // 500 .. 620
      this.span = 400 + Math.random() * 250;         // band span 400 .. 650
      this.fHi = this.fLo + this.span;
      this.fRef = this.fLo + Math.random() * this.span; // hidden carrier

      // Lock thresholds are also per-session. A source reader learns the
      // *generation ranges*, not the live values, so a pattern calibrated on
      // one visit does not transfer. (An agent that simply over-satisfies
      // every range still passes - this is a cost heuristic, not a secret.)
      this.holdMs = 2600 + Math.random() * 1200;     // 2600 .. 3800
      this.gapLimitMs = 600 + Math.random() * 250;   // 600 .. 850
      // Organic-cadence floor as a coefficient of variation (sd/mean of
      // recent pointer intervals). Fixed-cadence automation sits ~0.02-0.05;
      // real input pipelines and hands sit well above.
      this.cvFloor = 0.05 + Math.random() * 0.04;    // 0.05 .. 0.09
      this.recentMin = 3 + Math.floor(Math.random() * 3); // 3 .. 5 per 500ms

      // Lock state
      this.dragging = false;
      this.lockAccum = 0;
      this.lastMoveT = 0;
      this.eventTimes = [];
      this.locked = false;
      this.rafId = null;
      this.time = 0;

      // Decorative chord traces (constant, carry no state)
      this.chordFrequencies = [261.63, 311.13, 392.00, 466.16];
      this.chordColors = [
        'rgba(255, 0, 204, 0.15)',
        'rgba(249, 215, 28, 0.15)',
        'rgba(0, 139, 163, 0.2)',
        'rgba(255, 0, 0, 0.1)'
      ];

      this.audio = null;
    }

    start() {
      const status = document.getElementById('osc-status');
      if (status) {
        status.innerText = 'STATUS: NEEDFUL PENDING';
        status.style.color = 'var(--text-color)';
      }
      canvas_touch_guard(this.canvas);
      spinChaff();

      // The gate is audible the moment it opens. The DECRYPT_SIGS click is
      // the user gesture: create the instrument here, confirm with a blip,
      // and run a soft idle drone so a visitor who has not grabbed the scope
      // yet still hears that the wire is live. The idle wobble is a fixed
      // decorative rate - it carries no carrier information.
      this.audio = new GateSynth();
      this.audio.armOpen();

      this.canvas.addEventListener('pointerdown', this._onDown = (e) => this.onDown(e));
      this.canvas.addEventListener('pointermove', this._onMove = (e) => this.onMove(e));
      this.canvas.addEventListener('pointerup', this._onUp = (e) => this.onUp(e));
      this.canvas.addEventListener('pointercancel', this._onCancel = (e) => this.onUp(e));

      const draw = () => {
        if (this.locked) return;
        this.drawDecor();
        this.rafId = requestAnimationFrame(draw);
      };
      draw();
    }

    frequencyAt(x) {
      const rect = this.canvas.getBoundingClientRect();
      return this.fLo + (x / rect.width) * this.span;
    }

    async onDown(e) {
      // Only the browser's real input pipeline may open the hunt. Page-side
      // synthetic dispatch (new PointerEvent / dispatchEvent) is untrusted
      // and dead here - which also kills every in-page test harness, ours
      // included.
      if (!e.isTrusted) return;
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
      this.dragging = true;
      if (!this.audio) this.audio = new GateSynth();
      try { await this.audio.resume(); } catch (err) { /* arm anyway */ }
      this.audio.setDroneOn(true);
      this.handleAim(e);
    }

    onMove(e) {
      if (!this.dragging || !e.isTrusted) return;
      e.preventDefault();
      this.handleAim(e);
    }

    onUp(e) {
      if (!this.dragging) return;
      this.dragging = false;
      this.eventTimes.length = 0;
      // lockAccum deliberately survives a quick re-grab: judgeLock's gap
      // limit already voids credit after a real pause, so this only forgives
      // humans who release and re-tune without losing resonance. Audio falls
      // back to the quiet idle drone rather than muting, so the wire stays
      // findable between grabs.
      if (this.audio) this.audio.setIdle();
    }

    handleAim(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const fUser = this.frequencyAt(x);
      const df = fUser - this.fRef;

      // Vertical axis sets listening level only (no information channel)
      const vol = 1 - Math.min(1, Math.abs(y - rect.height / 2) / (rect.height / 2));
      if (this.audio) this.audio.setLevel(0.45 + 0.4 * vol);

      // Tremolo rate = distance, pan = direction. Neither leaks the carrier.
      if (this.audio) this.audio.steer(df);

      this.judgeLock(df, performance.now());
    }

    judgeLock(df, now) {
      this.eventTimes.push(now);
      if (this.eventTimes.length > 24) this.eventTimes.shift();

      const dt = now - this.lastMoveT;
      this.lastMoveT = now;

      if (Math.abs(df) > 3) { this.lockAccum = 0; return; }
      // A real pause voids the credit: resonance must be actively held, not
      // visited twice. A clock-like stream (see streamIsOrganic) never
      // accrues at all - it just earns nothing, event after event.
      if (dt > this.gapLimitMs) { this.lockAccum = 0; return; }
      if (!this.streamIsOrganic()) return;

      this.lockAccum += Math.min(dt, 120);
      if (this.lockAccum >= this.holdMs) this.unlock();
    }

    // Resonance only accrues under an input stream that looks like a hand:
    // dense events whose timing varies. The metric is the coefficient of
    // variation of recent intervals - scale-free, so it rejects fixed-rate
    // schedulers at any cadence while passing real pipelines at any speed.
    streamIsOrganic() {
      const t = this.eventTimes;
      const n = t.length;
      if (n < 7) return false;
      let recent = 0;
      for (let i = n - 1; i >= 0; i--) {
        if (t[n - 1] - t[i] <= 500) recent++;
        else break;
      }
      if (recent < this.recentMin) return false;

      const k = Math.min(12, n - 1);
      const intervals = [];
      for (let i = n - k; i < n; i++) intervals.push(t[i] - t[i - 1]);
      const mean = intervals.reduce((a, v) => a + v, 0) / intervals.length;
      if (mean <= 0) return false;
      const variance = intervals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / intervals.length;
      return Math.sqrt(variance) / mean >= this.cvFloor;
    }

    async unlock() {
      if (this.locked) return;
      this.locked = true;

      const status = document.getElementById('osc-status');
      if (status) status.innerText = 'NEEDFUL PERFORMED';
      if (this.audio) this.audio.lockChime();

      try {
        // Final assembly of the build-up. The shards recombine HERE, inside
        // the gate that earned them, and are imported straight into WebCrypto
        // as a non-extractable AES-GCM key. No passphrase string ever exists;
        // there is no password-taking function left to hook. A console watch
        // on any global sees only a CryptoKey handle - the raw material
        // crosses exactly one boundary (importKey) and is zeroed before the
        // first decrypt lands.
        const parts = vault.get(this.canvas);
        const b = this._shardB;
        if (!parts || !b) throw new Error('VAULT_SEALED');
        if (this.lockAccum < this.holdMs || !this.streamIsOrganic()) {
          throw new Error('CARRIER KEY MISMATCH');
        }
        const material = new Uint8Array(parts.a.length + b.length + parts.maskedC.length);
        material.set(parts.a, 0);
        material.set(b, parts.a.length);
        for (let i = 0; i < parts.maskedC.length; i++) {
          material[parts.a.length + b.length + i] = parts.maskedC[i] ^ parts.mask[i % parts.mask.length];
        }
        try {
          await this.decryptManifest(material);
        } finally {
          material.fill(0);
        }
      } catch (e) {
        if (status) {
          status.innerText = 'ERROR: CARRIER KEY MISMATCH // MANIFEST STALE';
          status.style.color = '#ff0000';
        }
        this.dispose();
        return;
      }

      // feeder artifact opens for the historical carrier, even on a real win
      DecryptManager.revealDecoy();

      setTimeout(() => {
        this.container.style.display = 'none';
        this.btn.innerText = 'SIGNAL_DECRYPTED';
        this.btn.disabled = true;
        this.btn.style.opacity = '0.5';
        this.btn.style.cursor = 'default';
        if (window.CRT_BURST) window.CRT_BURST();
      }, 450);

      this.dispose();
    }

    // The manifest decrypt loop runs privately on crypto.subtle. Per blob:
    // parse salt||iv||ciphertext, derive a fresh non-extractable AES-GCM key
    // from the shared material over that blob's salt, decrypt. This mirrors
    // crypt-lib exactly (PBKDF2-SHA256 x100k, AES-GCM) minus the password
    // parameter that made the old path hookable.
    async decryptManifest(material) {
      const subtle = crypto.subtle;
      const decoder = new TextDecoder();
      const redactedElms = document.querySelectorAll('.redacted:not(.decoy)');
      for (let el of redactedElms) {
        const b64 = el.getAttribute('data-blob');
        if (!b64) continue;
        const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const salt = bin.slice(0, 16);
        const iv = bin.slice(16, 28);
        const data = bin.slice(28);
        const baseKey = await subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
        const aesKey = await subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
        aberration(el, decoder.decode(plain));
      }
    }

    drawDecor() {
      const ctx = this.ctx2d;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // trails
      ctx.fillRect(0, 0, this.width, this.height);
      this.time += 0.05;

      // Ambient chord traces only. Deliberately stateless: nothing on this
      // canvas encodes the carrier or the visitor's distance to it.
      for (let i = 0; i < this.chordFrequencies.length; i++) {
        ctx.beginPath();
        let chordH = 15;
        let fMult = this.chordFrequencies[i] * 0.001;
        for (let x = 0; x < this.width; x++) {
          let y = this.height / 2 + Math.sin(x * fMult + this.time * (i + 1) * 0.5) * chordH;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = this.chordColors[i];
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    dispose() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.canvas.removeEventListener('pointerdown', this._onDown);
      this.canvas.removeEventListener('pointermove', this._onMove);
      this.canvas.removeEventListener('pointerup', this._onUp);
      this.canvas.removeEventListener('pointercancel', this._onCancel);
      gateRegistry.delete(this.canvas);
      if (this.audio) this.audio.shutdown();
    }
  }

  function canvas_touch_guard(canvas) {
    // The hunt is a continuous drag; the page must not scroll under a thumb
    canvas.style.touchAction = 'none';
  }

  /**
   * GateSynth - self-contained WebAudio feedback instrument.
   *
   * Signal chain: fixed drone (660Hz fundamental + soft 990Hz partial,
   * kept above 500 with the hunt band) ->
   * tremolo gain (LFO rate = distance to carrier) -> stereo panner
   * (direction) -> out. The band is chosen to sit inside what laptop
   * speakers actually reproduce; the old 110Hz sub-bass drone was
   * inaudible on most hardware. The output spectrum contains only the
   * drone and the tremolo sidebands, so capture + FFT reveals exactly
   * what the ear hears: how far, which way. The carrier itself is never
   * emitted.
   *
   * Lifecycle: armOpen() at gate open (blip + idle drone), full steering
   * while the pointer is down, setIdle() between grabs, lockChime() on win.
   */
  class GateSynth {
    constructor() {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      this.droneA = this.ctx.createOscillator();
      this.droneA.type = 'sine';
      this.droneA.frequency.value = 660;
      this.droneB = this.ctx.createOscillator();
      this.droneB.type = 'sine';
      this.droneB.frequency.value = 990;
      this.harmonicGain = this.ctx.createGain();
      this.harmonicGain.gain.value = 0.22;

      // Tremolo: LFO rides on the drone gain param
      this.preGain = this.ctx.createGain();
      this.preGain.gain.value = 0.0;
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.value = 0.5;
      this.lfoDepth = this.ctx.createGain();
      this.lfoDepth.gain.value = 0.0; // armed with the drone
      this.lfo.connect(this.lfoDepth);
      this.lfoDepth.connect(this.preGain.gain);

      this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;

      this.droneA.connect(this.preGain);
      this.droneB.connect(this.harmonicGain);
      this.harmonicGain.connect(this.preGain);
      if (this.panner) {
        this.preGain.connect(this.panner);
        this.panner.connect(this.master);
      } else {
        this.preGain.connect(this.master);
      }
      this.master.connect(this.ctx.destination);

      this.droneA.start();
      this.droneB.start();
      this.lfo.start();
    }

    async resume() {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }

    // Called at gate open, inside the DECRYPT_SIGS click gesture: confirm
    // the channel with a blip and settle into a soft idle drone so sound
    // is self-evident before the visitor ever grabs the scope.
    armOpen() {
      this.ctx.resume().catch(() => {});
      this.openBlip();
      this.setIdle();
    }

    // Quiet attention state between drags. Fixed wobble rate and centered
    // pan: carries no carrier information.
    setIdle() {
      const t = this.ctx.currentTime;
      this.preGain.gain.setTargetAtTime(0.22, t, 0.3);
      this.lfoDepth.gain.setTargetAtTime(0.10, t, 0.3);
      this.lfo.frequency.setTargetAtTime(2.2, t, 0.3);
      if (this.panner) this.panner.pan.setTargetAtTime(0, t, 0.3);
    }

    setDroneOn(on) {
      const t = this.ctx.currentTime;
      this.preGain.gain.setTargetAtTime(on ? 0.7 : 0.0, t, 0.12);
      this.lfoDepth.gain.setTargetAtTime(on ? 0.32 : 0.0, t, 0.12);
      if (!on && this.panner) this.panner.pan.setTargetAtTime(0, t, 0.12);
    }

    // Short two-note tick the instant the instrument arms, so the visitor
    // knows sound is live before they have steered anywhere.
    openBlip() {
      const t0 = this.ctx.currentTime;
      [523.25, 783.99].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = t0 + i * 0.07;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    }

    setLevel(level) {
      this.master.gain.setTargetAtTime(Math.max(0.05, Math.min(1.0, level)), this.ctx.currentTime, 0.08);
    }

    // df: signed distance from carrier in Hz
    steer(df) {
      const t = this.ctx.currentTime;
      const dist = Math.abs(df);
      const rate = dist <= 2.5 ? 0.15 : Math.min(11, 0.5 + 2.1 * Math.log2(1 + dist / 3));
      const pan = Math.sign(df) * Math.min(1, dist / 240);
      this.lfo.frequency.setTargetAtTime(rate, t, 0.08);
      if (this.panner) this.panner.pan.setTargetAtTime(pan, t, 0.08);
    }

    // Confirmation arpeggio while the manifest reveals
    lockChime() {
      const t0 = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = t0 + i * 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.7);
      });
    }

    shutdown() {
      try {
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(0.0001, t, 0.15);
        setTimeout(() => this.ctx.close().catch(() => {}), 600);
      } catch (e) { /* context already gone */ }
    }
  }

  // --- public surface ------------------------------------------------------------
  return {
    init: () => {
      const btn = document.getElementById('decrypt-btn');
      const container = document.getElementById('oscilloscope-container');
      const canvas = document.getElementById('osc-canvas');
      if (!btn || !container || !canvas) return;
      seedVault(canvas);
      btn.addEventListener('click', () => {
        container.style.display = 'flex';
        DecryptManager.startCarrierHunt(canvas, container, btn);
      });
    },

    startCarrierHunt: (canvas, container, btn) => {
      // Re-entry guard: the live gate is reachable only through the canvas
      if (gateRegistry.get(canvas)) return;
      const gate = new CarrierGate(canvas, container, btn);
      gateRegistry.set(canvas, gate);
      gate.start();
    },

    // POISONED. The historical unlock shape. No passphrase is honored here,
    // ever: anything that calls it - with a guessed key, a chaff key, a
    // hooked key, anything - gets the feeder artifact and nothing else.
    // The manifest only ever decrypts inside the gate that earned it.
    revealAll: async () => {
      await DecryptManager.revealDecoy();
    },

    // The feeder artifact opens with the retired legacy carrier. Anyone who
    // reconstructed it from source or history gets the taunt, not the manifest.
    revealDecoy: async () => {
      const decoy = document.querySelector('.redacted.decoy');
      if (!decoy) return;
      const blob = decoy.getAttribute('data-blob');
      if (!blob) return;
      try {
        const taunt = await STOCHASTIC_ENCRYPT.decrypt(blob, '40-240');
        decoy.classList.add('decoy-hit');
        aberration(decoy, taunt);
      } catch (e) { /* decoy is flavor, never fatal */ }
    },

    aberrationTransition: (el, finalOutput) => aberration(el, finalOutput),
  };
})();

document.addEventListener('DOMContentLoaded', DecryptManager.init);
