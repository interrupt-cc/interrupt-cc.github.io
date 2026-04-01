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

## 04: Fuzzy AES-GCM (Cryptographic Forgiveness)

The `STOCHASTIC_OVERRIDE` puzzle requires you to physically match the frequency of a carrier wave on an oscilloscope visualizer. This deterministic layout maps your `<canvas>` drop coordinates onto an exact frequency and amplitude payload (e.g., `40-240`).

The `batch-redact.js` compiler bakes this exact string into the AES-GCM cryptographic headers of your sensitive CV blocks.

**The Problem**: AES-GCM requires 100% bit-perfect password matching. Mobile viewers dragging their thumbs on 6-inch screens literally cannot reliably stop on the pixel-perfect `40-240` integer string.

**The Solution**: A multi-dimensional Hacker "Micro Brute-Force".

Upon releasing your finger on mobile, `js/cv.js` captures your approximate coordinate drop block. Without the user knowing, the Javascript engine unleashes a nested loop that instantly runs **over 230 discrete native SubtlyCrypto AES-GCM tests** iterating over a tight +/- 5 Amplitude and +/- 10 Frequency physical radius. 

```javascript
for (let a = uA - rAmp; a <= uA + rAmp; a++) {
    for (let f = uF - rFreq; f <= uF + rFreq; f++) {
        // ... await STOCHASTIC_ENCRYPT.decrypt(attempt);
    }
}
```

This guarantees 100% cryptographic Payload authenticity without demanding physically impossible pixel-perfect touch behavior.
