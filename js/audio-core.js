/**
 * audio-core.js
 * Main Thread Interface for the STOCHASTIC_AUDIO Engine
 * Manages the AudioContext and the lock-free Float32Array bridge to the worklet.
 */

class StochasticAudioController {
    constructor() {
        this.ctx = null;
        this.synthNode = null;
        this.isReady = false;
        
        // Reusable array for zero allocation GC-free message passing
        this._msgBuffer = new Float32Array(3);
    }

    async init() {
        if (this.ctx) return; // Already initialized
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[AUDIO_CORE]: Context unlocked state: ', this.ctx.state);
            
            // Inline the Worklet processor to bypass file:// CORS restrictions for local testing
            const workletCode = `
class SineOscillator {
    constructor(sampleRate) { this.sampleRate = sampleRate; this.phase = 0; this.frequency = 440; this.amplitude = 0; this.targetAmp = 0; }
    set(freq, amp) { this.frequency = freq; this.targetAmp = amp; }
    process() {
        this.amplitude += (this.targetAmp - this.amplitude) * 0.005;
        this.phase += (this.frequency * 2 * Math.PI) / this.sampleRate;
        if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;
        return Math.sin(this.phase) * this.amplitude;
    }
}
class StochasticSynthProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = 48000;
        this.chordOscs = [new SineOscillator(this.sampleRate), new SineOscillator(this.sampleRate), new SineOscillator(this.sampleRate), new SineOscillator(this.sampleRate)];
        this.chordOscs[0].set(261.63, 0.1); this.chordOscs[1].set(311.13, 0.08); this.chordOscs[2].set(392.00, 0.06); this.chordOscs[3].set(466.16, 0.05);
        this.targetOsc = new SineOscillator(this.sampleRate); this.targetOsc.set(0, 0);
        this.userOsc = new SineOscillator(this.sampleRate); this.userOsc.set(0, 0);
        this.port.onmessage = (event) => {
            const data = event.data;
            if (data[0] === 0) { this.userOsc.set(data[1], data[2]); } 
            else if (data[0] === 1) { this.targetOsc.set(data[1], data[2]); } 
            else if (data[0] === 2) { this.targetOsc.set(this.targetOsc.frequency, 0.0); this.userOsc.set(this.userOsc.frequency, 0.0); }
        };
    }
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;
        for (let i = 0; i < output[0].length; ++i) {
            let chordSample = 0;
            for(let o = 0; o < this.chordOscs.length; o++) { chordSample += this.chordOscs[o].process(); }
            const targetSample = this.targetOsc.process();
            const userSample = this.userOsc.process();
            let master = chordSample + targetSample + userSample;
            master = Math.max(-1, Math.min(1, master * 1.5 - 0.5 * Math.pow(master, 3)));
            for (let channel = 0; channel < channelCount; ++channel) { output[channel][i] = master; }
        }
        return true;
    }
}
registerProcessor('stochastic-synth-v1', StochasticSynthProcessor);
            `;
            
            // Build pseudo-file URL
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            
            await this.ctx.audioWorklet.addModule(blobUrl);
            this.synthNode = new AudioWorkletNode(this.ctx, 'stochastic-synth-v1');
            URL.revokeObjectURL(blobUrl); // Cleanup pseudo-file
            
            // --- DUB TECHNO SPATIAL FX CHAIN ---
            // 1. Filtered Delay (The "Echo")
            const delay = this.ctx.createDelay(5.0);
            delay.delayTime.value = 0.45; // 450ms (classic dub timing)
            
            const feedback = this.ctx.createGain();
            feedback.gain.value = 0.6; // High feedback for evolving texture

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800; // Muffled echoes

            // Routing the Delay Loop: delay -> filter -> feedback -> back to delay
            delay.connect(filter);
            filter.connect(feedback);
            feedback.connect(delay);

            // Master routing: Synth -> Destination & Synth -> Delay -> Destination
            this.synthNode.connect(this.ctx.destination);
            this.synthNode.connect(delay);
            delay.connect(this.ctx.destination);

            this.isReady = true;
            console.log('[AUDIO_CORE]: Thread bridge and Dub FX Engine established.');
        } catch (e) {
            console.error('[AUDIO_CORE]: Failed to instantiate Worklet', e);
        }
    }

    sendEvent(type, val1, val2) {
        if (!this.isReady) return;
        this._msgBuffer[0] = type;
        this._msgBuffer[1] = val1;
        this._msgBuffer[2] = val2;
        // Using postMessage with the buffer. Browsers optimize TypedArrays aggressively.
        this.synthNode.port.postMessage(this._msgBuffer);
    }

    // High-level API for CV Puzzle
    updateUserSync(freq, amp) {
        // [ Type 0: User Update ]
        this.sendEvent(0, freq, amp);
    }

    activateTarget(freq, amp) {
        // [ Type 1: Target Anomaly On ]
        this.sendEvent(1, freq, amp);
    }

    shutdownAnomaly() {
        // [ Type 2: Shut down active anomalies, leave chord playing ]
        this.sendEvent(2, 0, 0);
    }
}

// Global Export
window.STOCHASTIC_AUDIO = new StochasticAudioController();
