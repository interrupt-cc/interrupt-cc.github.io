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
            
            // Load the worklet module
            await this.ctx.audioWorklet.addModule('../js/synth-processor.js');
            
            this.synthNode = new AudioWorkletNode(this.ctx, 'stochastic-synth-v1');
            
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
