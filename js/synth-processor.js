/**
 * synth-processor.js
 * STOCHASTIC_AUDIO Core DSP Engine (AudioWorklet)
 * Generates the Dub Techno background chord and processes the interactive target/user frequencies
 * in a realtime thread with lock-free parameter queues.
 */

// Simple Sine Oscillator
class SineOscillator {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.phase = 0;
        this.frequency = 440;
        this.amplitude = 0;
        this.targetAmp = 0;
    }
    set(freq, amp) {
        this.frequency = freq;
        this.targetAmp = amp;
    }
    process() {
        // Simple slew-limiter (lowpass) on amplitude to prevent clicks
        this.amplitude += (this.targetAmp - this.amplitude) * 0.005;
        
        const phaseIncrement = (this.frequency * 2 * Math.PI) / this.sampleRate;
        this.phase += phaseIncrement;
        if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;
        
        return Math.sin(this.phase) * this.amplitude;
    }
}

class StochasticSynthProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = 48000; // Will be passed from context if needed, default standard

        // 1. Dub Techno Chord (C4 minor 7th)
        this.chordOscs = [
            new SineOscillator(this.sampleRate), // C4
            new SineOscillator(this.sampleRate), // Eb4
            new SineOscillator(this.sampleRate), // G4
            new SineOscillator(this.sampleRate)  // Bb4
        ];
        
        // Initialize chord (Subtle amplitudes for background hum)
        this.chordOscs[0].set(261.63, 0.1);
        this.chordOscs[1].set(311.13, 0.08);
        this.chordOscs[2].set(392.00, 0.06);
        this.chordOscs[3].set(466.16, 0.05);

        // 2. The Target Anomaly
        this.targetOsc = new SineOscillator(this.sampleRate);
        this.targetOsc.set(0, 0); // Will be enabled when puzzle opens

        // 3. User Sync Signal
        this.userOsc = new SineOscillator(this.sampleRate);
        this.userOsc.set(0, 0);

        // Lock-free queue handler via Float32Array messaging
        this.port.onmessage = (event) => {
            // event.data = Float32Array [ msgType, val1, val2 ]
            // Types: 0 = User Signal Update, 1 = Target Activate, 2 = Target Deactivate
            const data = event.data;
            if (data[0] === 0) {
                this.userOsc.set(data[1], data[2]); // freq, amp
            } else if (data[0] === 1) {
                this.targetOsc.set(data[1], data[2]);
            } else if (data[0] === 2) {
                // Shut down targets (Successful sync or closed)
                this.targetOsc.set(this.targetOsc.frequency, 0.0);
                this.userOsc.set(this.userOsc.frequency, 0.0);
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        // Process DSP loop frame-by-frame
        for (let i = 0; i < output[0].length; ++i) {
            
            // Mix down chord
            let chordSample = 0;
            for(let o = 0; o < this.chordOscs.length; o++) {
                chordSample += this.chordOscs[o].process();
            }

            // Mix active anomaly waves
            const targetSample = this.targetOsc.process();
            const userSample = this.userOsc.process();

            // Saturated master mix
            let master = chordSample + targetSample + userSample;
            // Soft clipping
            master = Math.max(-1, Math.min(1, master * 1.5 - 0.5 * Math.pow(master, 3)));

            // Write to all channels (Mono to Stereo)
            for (let channel = 0; channel < channelCount; ++channel) {
                output[channel][i] = master;
            }
        }

        // Return true to keep the processor alive continuously
        return true;
    }
}

registerProcessor('stochastic-synth-v1', StochasticSynthProcessor);
