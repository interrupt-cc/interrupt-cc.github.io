/**
 * stochastic-player.js
 * Streams physical audio sources sequentially and triggers
 * the generative granular macro-envelope at stochastic intervals.
 */

class StochasticPlayer {
    constructor() {
        this.trackMap = {};
        this.tracklist = [];
        this.audioElement = new Audio();
        
        this.alienAudio = new Audio();
        this.alienAudio.loop = true;
        this.alienAudio.muted = true; // Carrier signal is hidden, not directly audible
        
        this.currentIndex = 0;
        this.isPlaying = false;
        
        this.sourceRouted = false;
        this.alienRouted = false;

        // Granular cloud automation bounds
        this.cloudActive = false;
        this.macroInterval = null;
    }

    async init() {
        try {
            // Pull dynamically compiled tracking manifest bound at window startup
            this.trackMap = window.STOCHASTIC_TRACKLIST || {};
            
            // Flatten map for the global "Next Track" shuffle logic
            this.tracklist = [];
            for (const folder in this.trackMap) {
                this.tracklist.push(...this.trackMap[folder]);
            }
            
            if (this.tracklist.length === 0) {
                console.warn('[AUDIO_PLAYER] Tracklist manifest empty.');
                return;
            }

            // Shuffle reference list exactly once per session load
            this.shuffleTracks();
            
            // Build UI components
            this.injectUI();
            this.injectDrawer();
            
            // Seed the initial alien carrier
            this.mutateAlien();

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
        this.playTrack(this.tracklist[this.currentIndex]);
    }

    playTrack(path) {
        if (!path) return;
        this.audioElement.src = encodeURI(path); 
        this.audioElement.play().then(() => {
            this.isPlaying = true;
            this.updateUI(path);
            
            // Ensure alien is playing and routed if possible
            if (this.alienAudio.src) {
                this.alienAudio.play().catch(() => {});
                if (window.STOCHASTIC_AUDIO && !this.alienRouted) {
                    window.STOCHASTIC_AUDIO.routeAlien(this.alienAudio);
                    this.alienRouted = true;
                }
            }
        }).catch(err => console.log('[AUDIO_PLAYER] Autoplay blocked.', err));
    }

    mutateAlien() {
        if (this.tracklist.length === 0) return;
        const randomTrack = this.tracklist[Math.floor(Math.random() * this.tracklist.length)];
        this.alienAudio.src = encodeURI(randomTrack);
        if (this.isPlaying) this.alienAudio.play().catch(() => {});
        console.log(`[AUDIO_PLAYER] Alien carrier mutated: ${randomTrack}`);
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
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div id="sp-toggle" style="cursor: pointer; font-weight: bold; margin-right: 10px; font-size: 1.2rem; color: var(--accent-color);">+</div>
                <div>
                   <div id="sp-status" style="color: var(--accent-color); margin-bottom: 2px;">[ SIGNAL_STREAM_STANDBY ]</div>
                   <div id="sp-track" style="opacity: 0.6; font-size: 0.75rem;">AWAITING OPTIC SYNC</div>
                </div>
            </div>
        `;

        playerUI.addEventListener('click', (e) => {
            // Explicitly handle drawer toggle
            if (e.target.id === 'sp-toggle') {
                this.toggleDrawer();
                return;
            }

            // Only trigger play/pause if clicking the status or track name
            const isText = e.target.id === 'sp-status' || e.target.id === 'sp-track' || e.target.parentElement?.id === 'sp-status';
            if (!isText) return;

            // Unlocks AudioContext exactly once
            if (window.STOCHASTIC_AUDIO) {
                window.STOCHASTIC_AUDIO.init().then(() => {
                    // Route HTML5 Audio through the WebAudio Graph for capture
                    if (!this.sourceRouted) {
                        window.STOCHASTIC_AUDIO.routePlayer(this.audioElement);
                        this.sourceRouted = true;
                    }
                    if (!this.alienRouted && this.alienAudio.src) {
                        window.STOCHASTIC_AUDIO.routeAlien(this.alienAudio);
                        this.alienRouted = true;
                    }
                    
                    // Sync all slider defaults (Master Pressure, Delay, etc.)
                    this.syncDSP();
                    
                    this.togglePlay();
                });
            }
        });

        document.body.appendChild(playerUI);
    }

    toggleDrawer() {
        const drawer = document.getElementById('sp-drawer');
        if (!drawer) return;
        const isOpen = drawer.style.maxHeight !== '0px' && drawer.style.maxHeight !== '';
        drawer.style.maxHeight = isOpen ? '0px' : '500px';
        drawer.style.borderTopWidth = isOpen ? '0px' : '1px';
        document.getElementById('sp-toggle').innerText = isOpen ? '+' : '−';
    }

    injectDrawer() {
        const root = document.getElementById('stochastic-player');
        const drawer = document.createElement('div');
        drawer.id = 'sp-drawer';
        drawer.style.cssText = `
            max-height: 0px; overflow-y: scroll; transition: max-height 0.4s ease, border 0.4s ease;
            width: 320px; border-top: 0px solid var(--dim-color); margin-top: 10px;
            text-align: left; scrollbar-width: none;
        `;
        
        // Prevent clicks inside the drawer from pausing the player
        drawer.addEventListener('click', (e) => e.stopPropagation());

        // 1. Hardware Control Hub (Knobs)
        const ctrlPanel = document.createElement('div');
        ctrlPanel.style.cssText = `padding: 15px 0; border-bottom: 1px solid var(--dim-color); margin-bottom: 10px;`;
        ctrlPanel.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--accent-color); letter-spacing: 2px; margin-bottom: 15px;">[ HARDWARE_CONTROL_HUB ]</div>
            
            <div class="knob-row">
                <label>DRY/WET_MIX</label>
                <input type="range" id="knob-mix" min="0" max="1" step="0.01" value="0">
            </div>
            <div class="knob-row">
                <label>GRAIN_DENSITY</label>
                <input type="range" id="knob-density" min="0" max="0.01" step="0.0001" value="0">
            </div>
            <div class="knob-row">
                <label>HANN_LENGTH</label>
                <input type="range" id="knob-length" min="0.01" max="0.5" step="0.001" value="0.08">
            </div>
            <div class="knob-row">
                <label>SIGNAL_ENTROPY</label>
                <input type="range" id="knob-entropy" min="0" max="4" step="0.01" value="0.5">
            </div>
            <div class="knob-row">
                <label>DELAY_TIME</label>
                <input type="range" id="knob-delay" min="0.01" max="2.0" step="0.01" value="0.45">
            </div>
            <div class="knob-row">
                <label>ECHO_FEEDBACK</label>
                <input type="range" id="knob-feedback" min="0" max="0.95" step="0.01" value="0.6">
            </div>

            <div style="font-size: 0.7rem; color: var(--accent-color); letter-spacing: 2px; margin: 15px 0 10px 0;">[ MASTERING & NORMALIZATION ]</div>
            <div class="knob-row" title="Manual loudness pressure. Boosts input into the compressor.">
                <label>MASTER_PRESSURE</label>
                <input type="range" id="knob-master-pressure" min="1.0" max="3.0" step="0.01" value="1.0">
            </div>

            <div style="font-size: 0.7rem; color: var(--accent-color); letter-spacing: 2px; margin: 15px 0 10px 0;">[ ALIEN_INTERRUPTION ]</div>
            <div class="knob-row">
                <label>MOD_DEPTH</label>
                <input type="range" id="knob-alien-depth" min="0" max="1" step="0.01" value="0">
            </div>
            <div class="knob-row">
                <label>MOD_MODE</label>
                <select id="knob-alien-mode" style="background: transparent; color: var(--text-color); border: 1px solid var(--dim-color); font-size: 0.6rem; width: 140px;">
                    <option value="0">RING_MOD (Metallic)</option>
                    <option value="1">AMP_MOD (Rhythm)</option>
                    <option value="2">FREQ_MOD (Alien)</option>
                </select>
            </div>
            <button id="btn-mutate-alien" class="sp-btn" style="margin-top: 5px;">MUTATE_CARRIER_SOURCE</button>

            <div style="font-size: 0.7rem; color: var(--accent-color); letter-spacing: 2px; margin: 15px 0 10px 0;">[ HORIZON_WAVE_STRUCT ]</div>
            <div class="knob-row">
                <label>WAVE_GEOMETRY</label>
                <input type="range" id="knob-wave-freq" min="0.05" max="0.5" step="0.01" value="0.15">
            </div>
            <div class="knob-row">
                <label>EDGE_DAMPING</label>
                <input type="range" id="knob-edge-damping" min="0" max="2.0" step="0.01" value="0">
            </div>
            <button id="btn-trigger-ripple" class="sp-btn" style="margin-top: 5px;">MANUAL_RESONANCE_TRIGGER</button>

            <div style="display: flex; gap: 5px; margin-top: 15px;">
                <button id="btn-randomize" class="sp-btn">STOCH_RANDOMIZE</button>
                <button id="btn-reset" class="sp-btn">SIGNAL_RESET</button>
            </div>
        `;

        // Style the knobs with CSS
        const style = document.createElement('style');
        style.innerText = `
            .knob-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.7rem; }
            .knob-row input { width: 140px; cursor: crosshair; }
            .sp-btn { flex: 1; background: transparent; border: 1px solid var(--dim-color); color: var(--text-color); font-family: monospace; font-size: 0.65rem; padding: 4px; cursor: pointer; }
            .sp-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
            .sp-folder { border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; padding: 5px 0; font-weight: bold; }
            .sp-folder:hover { color: var(--accent-color); }
            .sp-tracklist { max-height: 0px; overflow: hidden; padding-left: 10px; font-size: 0.75rem; transition: max-height 0.3s ease; }
            .sp-track { padding: 3px 0; opacity: 0.6; cursor: pointer; }
            .sp-track:hover { opacity: 1; color: var(--accent-color); }
        `;
        document.head.appendChild(style);

        // 2. Master Accordion Headers
        const signalHeader = document.createElement('div');
        signalHeader.className = 'acc-header';
        signalHeader.innerHTML = `> [ SIGNAL_STREAM_CONTROLS ] <span class="acc-status">[−]</span>`;
        
        const signalContent = document.createElement('div');
        signalContent.className = 'acc-content active';
        signalContent.appendChild(ctrlPanel);

        const archiveHeader = document.createElement('div');
        archiveHeader.className = 'acc-header';
        archiveHeader.innerHTML = `> [ AUDIO_ARCHIVE_SELECTION ] <span class="acc-status">[+]</span>`;
        
        const archiveContent = document.createElement('div');
        archiveContent.className = 'acc-content';
        archiveContent.id = 'archive-content';

        // Style the accordions
        const accStyle = document.createElement('style');
        accStyle.innerText = `
            .acc-header { 
                font-size: 0.75rem; color: var(--accent-color); letter-spacing: 2px; 
                padding: 10px 0; border-bottom: 1px solid rgba(0, 229, 255, 0.1); 
                cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                user-select: none;
            }
            .acc-header:hover { color: var(--text-color); }
            .acc-content { max-height: 0px; overflow: hidden; transition: max-height 0.4s ease; }
            .acc-content.active { max-height: 1000px; }
            .acc-status { font-size: 0.6rem; opacity: 0.6; }
        `;
        document.head.appendChild(accStyle);

        const toggleAcc = (header, content) => {
            const isActive = content.classList.toggle('active');
            header.querySelector('.acc-status').innerText = isActive ? '[−]' : '[+]';
        };

        signalHeader.onclick = () => toggleAcc(signalHeader, signalContent);
        archiveHeader.onclick = () => toggleAcc(archiveHeader, archiveContent);

        drawer.appendChild(signalHeader);
        drawer.appendChild(signalContent);
        drawer.appendChild(archiveHeader);
        drawer.appendChild(archiveContent);

        // 2. Accordion Track Engine - Inject into archiveContent
        for (const folder in this.trackMap) {
            const folderWrap = document.createElement('div');
            folderWrap.innerHTML = `
                <div class="sp-folder">> ${folder.toUpperCase()}</div>
                <div class="sp-tracklist"></div>
            `;
            const header = folderWrap.querySelector('.sp-folder');
            const list = folderWrap.querySelector('.sp-tracklist');
            
            this.trackMap[folder].forEach(trackPath => {
                const trackItem = document.createElement('div');
                trackItem.className = 'sp-track';
                const name = trackPath.split('/').pop().replace('.m4a', '');
                trackItem.innerText = `// ${name}`;
                trackItem.onclick = (e) => {
                    e.stopPropagation();
                    this.playTrack(trackPath);
                };
                list.appendChild(trackItem);
            });

            header.onclick = (e) => {
                e.stopPropagation();
                // Accordion behavior: Close others
                document.querySelectorAll('.sp-tracklist').forEach(el => {
                    if (el !== list) el.style.maxHeight = '0px';
                });
                list.style.maxHeight = list.style.maxHeight === '500px' ? '0px' : '500px';
            };
            
            archiveContent.appendChild(folderWrap);
        }

        root.appendChild(drawer);

        // 3. Hardware Connectors
        ['knob-mix', 'knob-density', 'knob-length', 'knob-entropy', 'knob-delay', 'knob-feedback', 'knob-alien-depth', 'knob-alien-mode', 'knob-master-pressure', 'knob-wave-freq', 'knob-edge-damping'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') el.onchange = () => this.syncDSP();
            else el.oninput = () => this.syncDSP();
        });

        document.getElementById('btn-mutate-alien').onclick = () => this.mutateAlien();
        document.getElementById('btn-trigger-ripple').onclick = () => {
            if (window.HORIZON) window.HORIZON.triggerRipple();
        };

        document.getElementById('btn-reset').onclick = () => {
            ['knob-mix', 'knob-density'].forEach(id => document.getElementById(id).value = 0);
            document.getElementById('knob-delay').value = 0.45;
            document.getElementById('knob-feedback').value = 0.6;
            document.getElementById('knob-master-pressure').value = 1.0;
            this.syncDSP();
        };

        document.getElementById('btn-randomize').onclick = () => {
            document.getElementById('knob-mix').value = (Math.random() * 0.5 + 0.5).toFixed(2);
            document.getElementById('knob-density').value = (Math.random() * 0.008).toFixed(4);
            document.getElementById('knob-length').value = (Math.random() * 0.3).toFixed(3);
            document.getElementById('knob-entropy').value = (Math.random() * 3.0).toFixed(2);
            document.getElementById('knob-delay').value = (Math.random() * 1.5 + 0.1).toFixed(2);
            document.getElementById('knob-feedback').value = (Math.random() * 0.8 + 0.1).toFixed(2);
            document.getElementById('knob-wave-freq').value = (Math.random() * 0.4 + 0.05).toFixed(2);
            document.getElementById('knob-edge-damping').value = (Math.random() * 1.5).toFixed(2);
            // Note: master-pressure is specifically excluded from randomization per user request
            this.syncDSP();
        };
    }

    syncDSP() {
        // Collect hardware state from UI
        const wet = parseFloat(document.getElementById('knob-mix')?.value || 0);
        const dens = parseFloat(document.getElementById('knob-density')?.value || 0);
        const len = parseFloat(document.getElementById('knob-length')?.value || 0.08);
        const ent = parseFloat(document.getElementById('knob-entropy')?.value || 0.5);
        const delay = parseFloat(document.getElementById('knob-delay')?.value || 0.45);
        const feedback = parseFloat(document.getElementById('knob-feedback')?.value || 0.6);
        const alienDepth = parseFloat(document.getElementById('knob-alien-depth')?.value || 0);
        const alienMode = parseInt(document.getElementById('knob-alien-mode')?.value || 0);
        const masterPressure = parseFloat(document.getElementById('knob-master-pressure')?.value || 1.0);
        const waveFreq = parseFloat(document.getElementById('knob-wave-freq')?.value || 0.15);
        const edgeDamping = parseFloat(document.getElementById('knob-edge-damping')?.value || 0);
        
        if (window.STOCHASTIC_AUDIO) {
            window.STOCHASTIC_AUDIO.setMix(1.0 - wet, wet);
            window.STOCHASTIC_AUDIO.updateGranularParams(1, dens, len, ent, wet * 0.8, alienMode, alienDepth);
            window.STOCHASTIC_AUDIO.setDelay(delay, feedback);
            window.STOCHASTIC_AUDIO.setMasterPressure(masterPressure);
        }
        if (window.HORIZON) {
            window.HORIZON.globalWavelength = waveFreq;
            window.HORIZON.edgeDamping = edgeDamping;
        }
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
