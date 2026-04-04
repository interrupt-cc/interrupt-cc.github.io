/**
 * stochastic-player.js
 * Streams physical audio sources sequentially and triggers
 * the generative granular macro-envelope at stochastic intervals.
 */

class StochasticPlayer {
    constructor() {
        this.tracklist = [];
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        this.currentIndex = 0;
        this.isPlaying = false;
        
        // Granular cloud automation bounds
        this.cloudActive = false;
        this.macroInterval = null;
    }

    async init() {
        try {
            // Pull dynamically compiled tracking manifest bound at window startup
            this.tracklist = window.STOCHASTIC_TRACKLIST || [];
            
            if (!this.tracklist || this.tracklist.length === 0) {
                console.warn('[AUDIO_PLAYER] Tracklist manifest empty.');
                return;
            }

            // Shuffle tracklist exactly once per session load
            this.shuffleTracks();
            
            // Build UI
            this.injectUI();

            this.audioElement.addEventListener('ended', () => this.playNextTrack());
            
            // Periodically check if we should unleash a stochastic granular cloud
            this.macroInterval = setInterval(() => this.evaluateCloudProbability(), 10000);

            console.log(`[AUDIO_PLAYER] Seeded ${this.tracklist.length} tracks.`);
        } catch (e) {
            console.error('[AUDIO_PLAYER] Manifest boot failed', e);
        }
    }

    shuffleTracks() {
        for (let i = this.tracklist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracklist[i], this.tracklist[j]] = [this.tracklist[j], this.tracklist[i]];
        }
    }

    playNextTrack() {
        if (this.tracklist.length === 0) return;
        
        this.currentIndex = (this.currentIndex + 1) % this.tracklist.length;
        const trackPath = this.tracklist[this.currentIndex];
        
        this.audioElement.src = trackPath; // trackPath originates from root MI+OM+RM/
        this.audioElement.play().then(() => {
            this.isPlaying = true;
            this.updateUI(trackPath);
        }).catch(err => console.log('[AUDIO_PLAYER] Autoplay blocked pending user interaction.', err));
    }

    togglePlay() {
        if (!window.STOCHASTIC_AUDIO || !window.STOCHASTIC_AUDIO.ctx) return;
        
        if (this.isPlaying) {
            this.audioElement.pause();
        } else {
            // If starting fresh
            if (!this.audioElement.src) {
                this.playNextTrack();
            } else {
                this.audioElement.play();
            }
        }
        this.isPlaying = !this.isPlaying;
        this.updateUI();
    }

    evaluateCloudProbability() {
        if (!this.isPlaying || this.cloudActive) return;
        
        // 5% chance every 10 seconds to generate a macro envelope
        if (Math.random() > 0.95) {
            this.triggerMacroEnvelope();
        }
    }

    triggerMacroEnvelope() {
        if (!window.STOCHASTIC_AUDIO) return;
        this.cloudActive = true;
        console.log('[STOCHASTIC_CLOUD] Triggering granular macroscopic aberration...');
        
        // The algorithmic envelope coordinates the DSP to freeze the buffer, 
        // spin up grains, wash in reverb, and fade back down over 15-30s.
        window.STOCHASTIC_AUDIO.launchGranularCloud().then(() => {
            this.cloudActive = false;
        });
    }

    injectUI() {
        const root = document.querySelector('.cv-container') || document.body;
        const playerUI = document.createElement('div');
        playerUI.id = 'stochastic-player';
        playerUI.style.cssText = `
            position: fixed; top: 1rem; right: 1rem; 
            background: rgba(0,0,0,0.85); border: 1px solid var(--dim-color);
            padding: 10px 15px; font-family: monospace; font-size: 0.8rem;
            color: var(--text-color); box-shadow: var(--glow-shadow);
            z-index: 10000; cursor: pointer; text-align: right;
        `;
        
        playerUI.innerHTML = `
            <div id="sp-status" style="color: var(--accent-color); margin-bottom: 5px;">[ SIGNAL_STREAM_STANDBY ]</div>
            <div id="sp-track" style="opacity: 0.6;">AWAITING OPTIC SYNC</div>
        `;

        playerUI.addEventListener('click', () => {
            // Unlocks AudioContext exactly once
            if (window.STOCHASTIC_AUDIO) window.STOCHASTIC_AUDIO.init();
            
            // Route HTML5 Audio through the WebAudio Graph for capture
            if (!this.sourceRouted) {
                window.STOCHASTIC_AUDIO.routePlayer(this.audioElement);
                this.sourceRouted = true;
            }
            
            this.togglePlay();
        });

        document.body.appendChild(playerUI);
    }

    updateUI(trackPath) {
        const elStatus = document.getElementById('sp-status');
        const elTrack = document.getElementById('sp-track');
        if (!elStatus || !elTrack) return;

        if (this.isPlaying) {
            elStatus.innerText = '[ SIGNAL_STREAM_ACTIVE ]';
            elStatus.style.color = '#00ff88';
            if (trackPath) {
                // Parse filename
                const parts = trackPath.split('/');
                elTrack.innerText = '> ' + parts[parts.length - 1];
            }
        } else {
            elStatus.innerText = '[ SIGNAL_STREAM_PAUSED ]';
            elStatus.style.color = 'var(--dim-color)';
        }
    }
}

window.STOCHASTIC_PLAYER = new StochasticPlayer();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.STOCHASTIC_PLAYER.init());
} else {
    window.STOCHASTIC_PLAYER.init();
}
