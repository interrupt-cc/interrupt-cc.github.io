# STOCHASTIC_AUDIO: Architecture & Sound Design

The `STOCHASTIC_AUDIO` engine provides real-time, zero-dependency, mathematically synthesized audio generation designed specifically for the `INTERRUPT.CC` ecosystem. It powers the ambient Dub Techno textures and the deterministic `STOCHASTIC_OVERRIDE` oscilloscope puzzles.

## 01: The Inline AudioWorklet (CORS Bypass)

Because the project strictly adheres to a **Zero-Dependency Isomorphic** philosophy, forcing developers or users to run `python3 -m http.server` locally just to test WebAudio processors was unacceptable.

Modern browsers (like Google Chrome) violently enforce CORS (Cross-Origin Resource Sharing) policies on `file://` URIs, rejecting standard `AudioWorkletNode.addModule('file.js')` network requests for security reasons.

To completely crush this limitation, the entire DSP Synthesizer script is literally hardcoded as a multi-line Javascript template literal inside `audio-core.js`. We compile this raw string directly into a localized memory `Blob`, and fetch it via a pseudo-file `URL.createObjectURL()`.

```javascript
// audio-core.js
const workletCode = `class StochasticSynthProcessor { ... }`;
const blob = new Blob([workletCode], { type: 'application/javascript' });
const blobUrl = URL.createObjectURL(blob);

// Universally bypasses file:// CORS restrictions!
await this.ctx.audioWorklet.addModule(blobUrl);
```
This isolates the audio thread completely, yet guarantees the system can run 100% offline straight from a double-clicked desktop HTML file.

---

## 02: Lock-Free `Float32Array` Bridging

To guarantee extreme UI responsiveness, the WebGL `<canvas>` tracks your mouse/touch coordinates at 60 FPS. Funneling standard Javascript Event Objects or JSON strings across the thread boundary into the `AudioWorklet` would aggressively trigger V8 garbage collection, causing catastrophic audio dropouts.

Instead, we pre-allocate a single mathematical vector buffer:
```javascript
this._msgBuffer = new Float32Array(3); // [ MsgType, Freq, Amp ]
```
Every frame, we overwrite the indexes in place and `postMessage(this._msgBuffer)` to the Worker. This results in **zero dynamic memory allocation** across the thread bridge.

---

## 03: The Dub Techno Synthesis Protocol

The core background drone of the signal feed is achieved via mathematically generated procedural sine oscillations directly in the Javascript DSP (Digital Signal Processing) engine.

- **Fundamental Voices**: Four discrete, free-running `SineOscillator` classes.
- **Root Tuning**: A C4 Minor 7th Chord `(C4, Eb4, G4, Bb4)`.
  - Tuned to `(261.63Hz, 311.13Hz, 392.00Hz, 466.16Hz)`.
- **Spatial Processing**: The master `audio-core.js` routing pushes the raw C4 cluster into a native WebAudio `DelayNode` set to a classic 450ms spatial delay, looping back onto itself through a muddy 800Hz `BiquadFilter` (Lowpass) with a 0.6 feedback gain to create evolving atmospheric echoes.

---

## 04: CARRIER_HUNT (Audio-Domain Resonance Lock)

The `STOCHASTIC_OVERRIDE` puzzle (v2) hides a carrier tone whose frequency is rolled **per session** from browser entropy inside a randomized pitch band (~140-1120 Hz). There is no visual target wave, no numeric readout, and no grep-able passphrase: the scope draws only stateless decorative chord traces.

**The only feedback channel is auditory.** `js/cv.js` (`GateSynth`) drives a fixed drone through a tremolo gain and a stereo panner:

- **Tremolo rate = |distance|** to the carrier (log-mapped, 11 Hz cap so the wobble reads as rhythm, not pitch).
- **Pan = direction** (drone sits left, drag left; sits right, drag right; centers as you converge).
- At resonance the tremolo falls still and the drone sits dead-center: the guitar-tuning instinct.

The output spectrum contains only the drone fundamental and its tremolo sidebands. Capture-and-FFT reveals exactly what the ear hears — how far, which way — and never the carrier itself. There is no analytic shortcut from any single frame; closeness has to be walked.

**The lock must be held**, not hit: ~3 seconds of continuous resonance under a pointer stream exhibiting human jitter (dense events, irregular intervals). Injected coordinate dumps and fixed-cadence automation hold no clock. Mobile forgiveness is inherent — a thumb near-resonance is within the ±3 Hz hysteresis window, no pixel-perfect drop required.

**Key handling**: the real manifest is sealed by `batch-redact.js` with a long random passphrase (offline brute-force over the static blob is dead). The passphrase ships only as the runtime-assembled `_CARRIER_CODES` array in `cv.js`, decoded inside the lock handler — static source analysis finds nothing to reconstruct. The retired `"40-240"` carrier survives exclusively as **bait**: it opens the `ARCHIVE_STRING` feeder artifact in the markup, which decrypts to a taunt for anything that reconstructs it. Automated agents are politely warned in the overlay and in an HTML comment; reconstruction attempts score as gate failures.

**Stated design limit**: static hosting cannot make decryption *impossible* — any client able to execute arbitrary JS in the page can hook the decrypt call directly. The gate prices out passive reconstruction (source reading, screenshot scraping, single-frame FFT, one-shot drags); it does not pretend to stop a live instrumentation harness.
