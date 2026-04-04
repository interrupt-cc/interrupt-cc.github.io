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
        this.chordAmpScaler = 0.0; this.targetChordAmpScaler = 0.0;
        this.port.onmessage = (event) => {
            const data = event.data;
            if (data[0] === 0) { this.userOsc.set(data[1], data[2]); } 
            else if (data[0] === 1) { this.targetOsc.set(data[1], data[2]); } 
            else if (data[0] === 2) { this.targetOsc.set(this.targetOsc.frequency, 0.0); this.userOsc.set(this.userOsc.frequency, 0.0); this.targetChordAmpScaler = 0.0; }
            else if (data[0] === 3) { this.targetChordAmpScaler = data[1]; }
        };
    }
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;
        for (let i = 0; i < output[0].length; ++i) {
            this.chordAmpScaler += (this.targetChordAmpScaler - this.chordAmpScaler) * 0.005;
            let chordSample = 0;
            for(let o = 0; o < this.chordOscs.length; o++) { chordSample += this.chordOscs[o].process(); }
            chordSample *= this.chordAmpScaler;
            const targetSample = this.targetOsc.process();
            const userSample = this.userOsc.process();
            
            // Mix master bus and add 30% headroom padding to prevent small-speaker distortion
            let master = (chordSample + targetSample + userSample) * 0.7;
            
            // Strict safety limit without mathematical saturation/drive
            master = Math.max(-1.0, Math.min(1.0, master));
            
            for (let channel = 0; channel < channelCount; ++channel) { output[channel][i] = master; }
        }
        return true;
    }
}
registerProcessor('stochastic-synth-v1', StochasticSynthProcessor);

// --- GENERATIVE GRANULAR PROCESSOR ---
class StochasticGranulatorProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = 48000;
        // 4 Second sliding capture ring buffer
        this.bufferSize = this.sampleRate * 4; 
        this.ringBuffer = new Float32Array(this.bufferSize);
        this.writePtr = 0;
        
        // Grain scheduling
        this.grains = [];
        this.framesSinceLastGrain = 0;
        
        // Cloud Envelope Parameters
        this.active = false;
        this.density = 0;      // 0 to 1. Probability of spawning a grain per frame
        this.grainLength = 0;  // in frames
        this.randomness = 0;   // offset distance
        this.masterGain = 0;   // cloud volume
        
        this.port.onmessage = (e) => {
            const data = e.data; // Float32Array: [type, active, density, length, randomness, gain]
            if (data[0] === 4) { // Macro Env Payload
                this.active = data[1] > 0;
                this.density = data[2];
                this.grainLength = data[3] * this.sampleRate; // convert seconds to frames
                this.randomness = data[4] * this.sampleRate;
                this.masterGain = data[5];
            }
        };
    }

    spawnGrain() {
        // Read position is slightly behind the write pointer, plus stochastic offset
        let readPtr = this.writePtr - Math.floor(Math.random() * this.randomness) - 4800; // at least 100ms behind
        if (readPtr < 0) readPtr += this.bufferSize;
        
        this.grains.push({
            position: 0,
            readPtr: readPtr,
            length: this.grainLength,
            speed: 0.95 + Math.random() * 0.1 // slight pitch drift
        });
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!output || !output[0]) return true;
        const channelCount = output.length;
        
        // 1. Record incoming audio continuously into the ring buffer
        if (input && input[0]) {
            for (let i = 0; i < input[0].length; ++i) {
                // Mix stereo to mono for the granular capture
                let mix = input[0][i];
                if (input[1]) mix = (mix + input[1][i]) * 0.5;
                
                this.ringBuffer[this.writePtr] = mix;
                this.writePtr = (this.writePtr + 1) % this.bufferSize;
            }
        }

        // 2. Grain Spawning Logic
        if (this.active && this.masterGain > 0.01) {
            for (let i = 0; i < output[0].length; ++i) {
                if (Math.random() < this.density) {
                    this.spawnGrain();
                }
            }
        }

        // 3. Process Active Grains (Hanning Window)
        for (let i = 0; i < output[0].length; ++i) {
            let outSample = 0;
            
            for (let g = this.grains.length - 1; g >= 0; g--) {
                let grain = this.grains[g];
                
                // Read from ring buffer
                let rIdx = Math.floor(grain.readPtr) % this.bufferSize;
                let sample = this.ringBuffer[rIdx];
                
                // Hanning Window envelope (bell curve matching the grain length)
                let windowEnv = 0.5 * (1 - Math.cos((2 * Math.PI * grain.position) / grain.length));
                
                outSample += sample * windowEnv;
                
                // Advance grain state
                grain.position += 1;
                grain.readPtr += grain.speed;
                
                if (grain.position >= grain.length) {
                    this.grains.splice(g, 1); // Kill dead grains
                }
            }
            
            // Output mixing
            outSample *= this.masterGain;
            outSample = Math.max(-1.0, Math.min(1.0, outSample)); // strict clip
            
            for (let channel = 0; channel < channelCount; ++channel) { 
                output[channel][i] = outSample; 
            }
        }
        
        return true;
    }
}
registerProcessor('stochastic-granulator', StochasticGranulatorProcessor);
            `;            
            // Build pseudo-file URL
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            
            await this.ctx.audioWorklet.addModule(blobUrl);
            this.synthNode = new AudioWorkletNode(this.ctx, 'stochastic-synth-v1');
            
            this.granularNode = new AudioWorkletNode(this.ctx, 'stochastic-granulator');
            
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

            // 2. Hardware Mixing Stage
            this.dryGain = this.ctx.createGain();
            this.wetGain = this.ctx.createGain();
            this.dryGain.gain.value = 1.0;
            this.wetGain.gain.value = 0.0;

            // Master routing: Synth -> Destination & Synth -> Delay -> Destination
            this.synthNode.connect(this.ctx.destination);
            this.synthNode.connect(delay);
            // delay.connect(this.ctx.destination); // Moved below
            
            // Granular Routing: Granulator -> Heavy Delay -> Destination
            this.granularNode.connect(this.ctx.destination);
            this.granularNode.connect(delay); // Tap into existing Dub Echo chain

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

    setChordVolume(vol) {
        // [ Type 3: Gate Master Chord Volume ]
        this.sendEvent(3, vol, 0);
    }

    // --- PLAYBACK ROUTING AND GENERATOR SEQUENCER ---
    
    routePlayer(audioElement) {
        if (!this.ctx || this.playerRouted) return;
        try {
            this.playerSource = this.ctx.createMediaElementSource(audioElement);
            
            // Direct playback hooks into the dryGain stage
            this.playerSource.connect(this.dryGain);
            this.dryGain.connect(this.ctx.destination);
            
            // Mirrored audio continually writes to the Granular capture ring buffer
            if (this.granularNode) {
                this.playerSource.connect(this.granularNode);
            }
            this.playerRouted = true;
            console.log('[AUDIO_CORE]: MediaElementSourceNode captured for granular processing.');
        } catch (e) {
            console.warn('[AUDIO_CORE]: WebAudio Capture Blocked (Security/CORS). Falling back to direct HTML5 playback.', e);
        }
    }

    async launchGranularCloud() {
        if (!this.granularNode || this.cloudLock) return;
        this.cloudLock = true;
        
        // Procedural Macro Envelope generating a slow physical swell over 15 seconds
        let phase = 0;
        const interval = setInterval(() => {
            phase += 0.05; // ~20 seconds full orbit to 1.0
            
            if (phase >= 1.0) {
                clearInterval(interval);
                this.updateGranularParams(0, 0, 0, 0, 0); // Shutdown
                this.cloudLock = false;
                return;
            }
            
            // Envelope curves
            let env = Math.sin(phase * Math.PI); // Smooth attack/decay curve
            
            // Calculate stochastic parameters based on env
            let density = env * 0.008; // extremely dense grains at peak
            let length = 0.05 + Math.random() * (env * 0.2); // 50ms to 250ms grains
            let randomness = env * 2.5; // up to 2.5 seconds read divergence at peak
            let volume = env * 0.4;
            
            this.updateGranularParams(1, density, length, randomness, volume);
            this.setMix(1.0 - env, env); // Crossfade correctly during automation
            
        }, 100); // 10hz update rate
    }

    setMix(dry, wet) {
        if (!this.isReady) return;
        this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.1);
        this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.1);
    }

    updateGranularParams(active, density, length, entropy, gain) {
        if (!this.granularNode) return;
        const msg = new Float32Array(6);
        msg[0] = 4; // Type 4
        msg[1] = active; 
        msg[2] = density; 
        msg[3] = length; 
        msg[4] = entropy;
        msg[5] = gain;
        this.granularNode.port.postMessage(msg);
    }
}

// Global Export
window.STOCHASTIC_AUDIO = new StochasticAudioController();
