/**
 * cv.js - Signal Decryption Logic for the CV_MANIFEST (v2: CARRIER_HUNT)
 *
 * The manifest is gated by a hidden carrier tone whose frequency is rolled
 * per session from crypto entropy. There is no visual target, no numeric
 * readout and no grep-able passphrase in this source. The ONLY feedback
 * channel is auditory: a drone whose tremolo rate carries |distance| to the
 * carrier and whose stereo pan carries the direction. A visitor tunes by ear
 * and holds resonance while a live (jittered, non-uniform) pointer stream is
 * detected. Low-frame-rate capture and static source analysis both see a
 * featureless scope.
 *
 * Design limit, stated honestly: any client that can execute arbitrary JS in
 * the page can hook the decrypt call itself. This gate raises the cost of
 * passive reconstruction; it cannot make it impossible on static hosting.
 */

const DecryptManager = {
  // Carrier key, assembled at runtime so the passphrase never appears as
  // text in the served source. Rotated from the retired "40-240" legacy
  // carrier, which now opens only the feeder artifact in the markup.
  // Regenerate via: node tools/batch-redact.js <template> <out> <new-pass>
  // and paste the emitted code array here.
  _CARRIER_CODES: [74,114,84,84,106,78,85,98,50,73,102,97,82,108,53,89,88,79,82,99,103,84,121,84,77,75],
  _LEGACY_CARRIER: '40-240', // bait: unlocks the decoy feeder blob only

  init: () => {
    const btn = document.getElementById('decrypt-btn');
    const container = document.getElementById('oscilloscope-container');
    const canvas = document.getElementById('osc-canvas');
    if (!btn || !container || !canvas) return;

    btn.addEventListener('click', () => {
      container.style.display = 'flex';
      DecryptManager.startCarrierHunt(canvas, container, btn);
    });
  },

  startCarrierHunt: (canvas, container, btn) => {
    // Re-entry guard: clicking twice must not stack audio graphs
    if (DecryptManager._activeGate) return;
    const gate = new CarrierGate(canvas, container, btn);
    DecryptManager._activeGate = gate;
    gate.start();
  },

  revealAll: async (password) => {
    const redactedElms = document.querySelectorAll('.redacted:not(.decoy)');
    for (let el of redactedElms) {
      const blob = el.getAttribute('data-blob');
      if (!blob) continue;
      const decodedText = await STOCHASTIC_ENCRYPT.decrypt(blob, password);
      DecryptManager.aberrationTransition(el, decodedText);
    }
  },

  // The feeder artifact opens with the retired legacy carrier. Anyone who
  // reconstructed it from source or history gets the taunt, not the manifest.
  revealDecoy: async () => {
    const decoy = document.querySelector('.redacted.decoy');
    if (!decoy) return;
    const blob = decoy.getAttribute('data-blob');
    if (!blob) return;
    try {
      const taunt = await STOCHASTIC_ENCRYPT.decrypt(blob, DecryptManager._LEGACY_CARRIER);
      decoy.classList.add('decoy-hit');
      DecryptManager.aberrationTransition(decoy, taunt);
    } catch (e) { /* decoy is flavor, never fatal */ }
  },

  aberrationTransition: (el, finalOutput) => {
    // Reveal text with a "scrambling" delay for aesthetic impact
    let iterations = 0;
    const originalText = el.innerText;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';

    const interval = setInterval(() => {
        el.innerText = el.innerText
            .split('')
            .map((char, index) => {
                if(index < iterations) {
                    return finalOutput[index];
                }
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('');

        if(iterations >= finalOutput.length) {
            clearInterval(interval);
            el.innerText = finalOutput;
            el.classList.add('revealed');
        }

        iterations += 1 / 3; // Speed of the reveal
    }, 50);
  }
};

/**
 * CarrierGate - the audio-domain lock.
 * Hidden reference frequency, random per session. The visitor drags through
 * pitch space; a tremolo drone slows as they close in and pans toward the
 * direction of travel. Resonance must be HELD for 3 seconds under a pointer
 * stream that exhibits human jitter before the carrier key is released.
 */
class CarrierGate {
  constructor(canvas, container, btn) {
    this.canvas = canvas;
    this.container = container;
    this.btn = btn;
    this.ctx2d = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Session pitch band. Rolled fresh on every visit: no coordinate,
    // screenshot or captured audio from a previous session helps.
    this.fLo = 140 + Math.random() * 180;          // 140 .. 320
    this.span = 520 + Math.random() * 280;         // band span 520 .. 800
    this.fHi = this.fLo + this.span;
    this.fRef = this.fLo + Math.random() * this.span; // hidden carrier

    // Lock thresholds are also per-session. A source reader learns the
    // *generation ranges*, not the live values, so a pattern calibrated on
    // one visit does not transfer. (An agent that simply over-satisfies
    // every range still passes - this is a cost heuristic, not a secret.)
    this.holdMs = 2600 + Math.random() * 1200;     // 2600 .. 3800
    this.gapLimitMs = 600 + Math.random() * 250;   // 600 .. 850
    this.jitterFloorMs = 0.6 + Math.random() * 0.8;// 0.6 .. 1.4
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
    await this.audio.resume();
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
    // humans who release and re-tune without losing resonance.
    if (this.audio) this.audio.setDroneOn(false);
  }

  handleAim(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const fUser = this.frequencyAt(x);
    const df = fUser - this.fRef;

    // Vertical axis sets listening level only (no information channel)
    const vol = 1 - Math.min(1, Math.abs(y - rect.height / 2) / (rect.height / 2));
    if (this.audio) this.audio.setLevel(0.15 + 0.5 * vol);

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
    // A long park (or an inhuman stream) zeroes the credit: resonance must
    // be actively held, not visited twice. Credit accrues from real elapsed
    // time between consecutive qualifying events.
    if (dt > this.gapLimitMs || !this.streamLooksHuman()) { this.lockAccum = 0; return; }

    this.lockAccum += Math.min(dt, 120);
    if (this.lockAccum >= this.holdMs) this.unlock();
  }

  // Resonance only accumulates under an input stream that looks like a hand:
  // dense events with irregular timing. Injected coordinate dumps and fixed
  // -cadence automation hold no clock here.
  streamLooksHuman() {
    const t = this.eventTimes;
    const n = t.length;
    if (n < 6) return false;
    let recent = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (t[n - 1] - t[i] <= 500) recent++;
      else break;
    }
    if (recent < this.recentMin) return false;

    const intervals = [];
    for (let i = Math.max(1, n - 8); i < n; i++) intervals.push(t[i] - t[i - 1]);
    if (intervals.length < 4) return false;
    const mean = intervals.reduce((a, v) => a + v, 0) / intervals.length;
    const variance = intervals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / intervals.length;
    return Math.sqrt(variance) >= this.jitterFloorMs;
  }

  async unlock() {
    if (this.locked) return;
    this.locked = true;

    const status = document.getElementById('osc-status');
    if (status) status.innerText = 'NEEDFUL PERFORMED';
    if (this.audio) this.audio.lockChime();

    const passphrase = String.fromCharCode(...DecryptManager._CARRIER_CODES);
    try {
      await DecryptManager.revealAll(passphrase);
      await DecryptManager.revealDecoy();
    } catch (e) {
      if (status) {
        status.innerText = 'ERROR: CARRIER KEY MISMATCH // MANIFEST STALE';
        status.style.color = '#ff0000';
      }
      this.dispose();
      DecryptManager._activeGate = null;
      return;
    }

    setTimeout(() => {
      this.container.style.display = 'none';
      this.btn.innerText = 'SIGNAL_DECRYPTED';
      this.btn.disabled = true;
      this.btn.style.opacity = '0.5';
      this.btn.style.cursor = 'default';
      if (window.CRT_BURST) window.CRT_BURST();
    }, 450);

    this.dispose();
    DecryptManager._activeGate = null;
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
        for(let x = 0; x < this.width; x++) {
            let y = this.height/2 + Math.sin(x * fMult + this.time * (i+1)*0.5) * chordH;
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
 * Signal chain: fixed drone (110Hz + soft 220Hz harmonic) -> tremolo gain
 * (LFO rate = distance to carrier) -> stereo panner (direction) -> out.
 * The output spectrum contains only the drone and the tremolo sidebands,
 * so capture + FFT reveals exactly what the ear hears: how far, which way.
 * The carrier frequency itself is never emitted.
 */
class GateSynth {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.droneA = this.ctx.createOscillator();
    this.droneA.type = 'sine';
    this.droneA.frequency.value = 110;
    this.droneB = this.ctx.createOscillator();
    this.droneB.type = 'sine';
    this.droneB.frequency.value = 220;
    this.harmonicGain = this.ctx.createGain();
    this.harmonicGain.gain.value = 0.18;

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

  setDroneOn(on) {
    const t = this.ctx.currentTime;
    this.preGain.gain.setTargetAtTime(on ? 0.55 : 0.0, t, 0.12);
    this.lfoDepth.gain.setTargetAtTime(on ? 0.32 : 0.0, t, 0.12);
    if (!on && this.panner) this.panner.pan.setTargetAtTime(0, t, 0.12);
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

document.addEventListener('DOMContentLoaded', DecryptManager.init);
