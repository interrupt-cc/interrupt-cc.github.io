/**
 * audio-core.js
 * Main Thread Interface for the STOCHASTIC_AUDIO Engine
 * Manages the AudioContext and the lock-free Float32Array bridge to the worklet.
 */

class StochasticAudioController {
    constructor() {
        this.ctx = null;
        this.synthNode = null;
        this.delayNode = null; // High-level reference
        this.feedbackNode = null; 
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
        
        // Alien Interruption Parameters
        this.alienModType = 0; // 0=RM, 1=AM, 2=FM
        this.alienModDepth = 0; 
        
        this.port.onmessage = (e) => {
            const data = e.data; // Float32Array: [type, active, density, length, randomness, gain, alienMode, alienDepth]
            if (data[0] === 4) { // Macro Env Payload
                this.active = data[1] > 0;
                this.density = data[2];
                this.grainLength = data[3] * this.sampleRate; // convert seconds to frames
                this.randomness = data[4] * this.sampleRate;
                this.masterGain = data[5];
                
                if (data.length > 6) {
                    this.alienModType = data[6];
                    this.alienModDepth = data[7];
                }
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
        const alien = inputs[1]; // Secondary modulation source
        const output = outputs[0];
        if (!output || !output[0]) return true;
        const channelCount = output.length;
        
        // 1. Record primary music continuously into the ring buffer
        if (input && input[0]) {
            for (let i = 0; i < input[0].length; ++i) {
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

        // 3. Process Active Grains (Hanning Window + Alien Modulation)
        for (let i = 0; i < output[0].length; ++i) {
            let outSample = 0;
            
            // Capture current alien sample for modulation
            const alienSample = (alien && alien[0]) ? alien[0][i] : 0;
            
            for (let g = this.grains.length - 1; g >= 0; g--) {
                let grain = this.grains[g];
                
                // --- ALIEN FM (Frequency Modulation) ---
                // Modulate grain speed by alien signal
                const speedMod = (this.alienModType === 2) ? (1.0 + alienSample * this.alienModDepth) : 1.0;
                
                // Read from ring buffer
                let rIdx = Math.floor(grain.readPtr) % this.bufferSize;
                let sample = this.ringBuffer[rIdx];
                
                // Hanning Window envelope
                let windowEnv = 0.5 * (1 - Math.cos((2 * Math.PI * grain.position) / grain.length));
                let grainOut = sample * windowEnv;
                
                // --- ALIEN RM/AM (Ring/Amplitude Modulation) ---
                if (this.alienModType === 0) { // RM: True multiplication (bipolar)
                    grainOut = grainOut * (1.0 - this.alienModDepth) + (grainOut * alienSample) * this.alienModDepth;
                } else if (this.alienModType === 1) { // AM: Unipolar envelope
                    const mod = (alienSample * 0.5 + 0.5);
                    grainOut = grainOut * (1.0 - this.alienModDepth) + (grainOut * mod) * this.alienModDepth;
                }
                
                outSample += grainOut;
                
                // Advance grain state
                grain.position += 1;
                grain.readPtr += (grain.speed * speedMod);
                
                if (grain.position >= grain.length) {
                    this.grains.splice(g, 1);
                }
            }
            
            outSample *= this.masterGain;
            outSample = Math.max(-1.0, Math.min(1.0, outSample));
            for (let channel = 0; channel < channelCount; ++channel) { output[channel][i] = outSample; }
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
            
            this.granularNode = new AudioWorkletNode(this.ctx, 'stochastic-granulator', {
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
            
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

            this.delayNode = delay;
            this.feedbackNode = feedback;

            // 2. Hardware Mixing Stage
            this.dryGain = this.ctx.createGain();
            this.wetGain = this.ctx.createGain();
            this.dryGain.gain.value = 1.0;
            this.wetGain.gain.value = 0.0;

            // Synthesis Routing: Synth -> Destination & Synth -> Delay -> Destination
            this.synthNode.connect(this.ctx.destination);
            this.synthNode.connect(delay);
            
            // Granular Routing: Granular -> WetGain -> Destination & Delay
            this.granularNode.connect(this.wetGain);
            this.wetGain.connect(this.ctx.destination);
            this.wetGain.connect(delay); 

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

    setDelay(time, feedback) {
        if (!this.isReady || !this.delayNode) return;
        this.delayNode.delayTime.setTargetAtTime(time, this.ctx.currentTime, 0.1);
        this.feedbackNode.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.1);
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
            console.warn('[AUDIO_CORE]: WebAudio Capture Blocked. Falling back to direct HTML5 playback.', e);
        }
    }

    routeAlien(audioElement) {
        if (!this.ctx || !this.granularNode) return;
        try {
            // Check for file protocol capture block
            if (window.location.protocol === 'file:') {
                console.warn('[AUDIO_CORE]: Alien Modulator blocked on local file:// protocol.');
                return;
            }
            this.alienSource = this.ctx.createMediaElementSource(audioElement);
            // Connect to input 1 of the granulator (input 0 is the main song)
            this.alienSource.connect(this.granularNode, 0, 1);
            console.log('[AUDIO_CORE]: Alien Interruption stream connected to modulation input.');
        } catch (e) {
            console.warn('[AUDIO_CORE]: Alien Routing failed.', e);
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

    updateGranularParams(active, density, length, entropy, gain, alienMode = 0, alienDepth = 0) {
        if (!this.granularNode) return;
        const msg = new Float32Array(8);
        msg[0] = 4; // Type 4
        msg[1] = active; 
        msg[2] = density; 
        msg[3] = length; 
        msg[4] = entropy;
        msg[5] = gain;
        msg[6] = alienMode;
        msg[7] = alienDepth;
        this.granularNode.port.postMessage(msg);
    }
}

// Global Export
window.STOCHASTIC_AUDIO = new StochasticAudioController();
