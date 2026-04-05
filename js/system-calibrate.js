/**
 * system-calibrate.js - High-Fidelity CRT & Glitch Controller
 * Refactored as a component for the master Stochastic Player drawer.
 */

class SystemCalibrator {
    constructor() {
        this.params = window.CRT_CONFIG || {
            pinch: 0.15,
            'p-interval': 4,
            'p-random': 0.5,
            noise: 0.25,
            freq: 4,
            snap: 1.8,
            bleed: 0.2,
            trails: 0.3,
            stoch: 0.4,
            'c-buffer': 0.15,
            'g-bunch': 0.45,
            'g-falloff': 0.5,
            'g-alpha': 0.3,
            'boost-contrast': 0
        };
    }

    generatePanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `padding: 15px 0; background: rgba(0, 229, 255, 0.02);`;

        const header = `
            <div style="font-size: 0.6rem; color: var(--accent-color); letter-spacing: 2px; border-bottom: 1px solid rgba(0, 229, 255, 0.1); padding-bottom: 8px; margin-bottom: 15px; opacity: 0.8;">
                [ CRT_HARDWARE_MODULE ]
            </div>
        `;

        const sections = [
            {
                title: 'SIGNAL_GEOMETRY',
                controls: [
                    { id: 'boost-contrast', label: 'MASTER_ENGINE_CONTRAST', type: 'toggle' },
                    { id: 'pinch', label: 'SINGULARITY_BREADTH', min: 0, max: 0.8, step: 0.01 },
                    { id: 'p-interval', label: 'GRAVITY_SPIKE_RATE', min: 0.25, max: 10, step: 0.25 },
                    { id: 'p-random', label: 'STOCHASTIC_DRIFT', min: 0, max: 1, step: 0.05 }
                ]
            },
            {
                title: 'DECOHERENCE_FLOOR',
                controls: [
                    { id: 'noise', label: 'GRAIN_INTENSITY', min: 0, max: 1, step: 0.01 },
                    { id: 'freq', label: 'CAPACITOR_CYCLE', min: 0.25, max: 10, step: 0.25 },
                    { id: 'snap', label: 'BURNOUT_MAGNITUDE', min: 1, max: 4, step: 0.1 }
                ]
            },
            {
                title: 'CHROMATIC_SUB_BLEED',
                controls: [
                    { id: 'bleed', label: 'COLOUR_BLEED', min: 0, max: 1, step: 0.01 },
                    { id: 'trails', label: 'PHOSPHOR_TRAILS', min: 0, max: 1, step: 0.01 },
                    { id: 'stoch', label: 'PIXEL_JITTER', min: 0, max: 1, step: 0.01 }
                ]
            },
            {
                title: 'RESONANCE_MESH',
                controls: [
                    { id: 'c-buffer', label: 'COMPRESSION_DRIFT', min: 0, max: 1, step: 0.01 },
                    { id: 'g-bunch', label: 'GRID_BUNCHING', min: 0, max: 1, step: 0.01 },
                    { id: 'g-falloff', label: 'GRID_FALLOFF', min: 0, max: 1, step: 0.01 },
                    { id: 'g-alpha', label: 'GRID_OPACITY', min: 0, max: 1, step: 0.01 }
                ]
            }
        ];

        let html = header;
        sections.forEach(sec => {
            html += `<div style="font-size: 0.6rem; color: var(--accent-color); opacity: 0.6; margin: 15px 0 10px 0; letter-spacing: 2px;">[ ${sec.title} ]</div>`;
            sec.controls.forEach(ctrl => {
                const val = this.params[ctrl.id];
                
                if (ctrl.type === 'toggle') {
                    const active = val > 0.5 ? 'color: #00FFFF; border: 1px solid #00FFFF;' : 'color: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.1);';
                    const text = val > 0.5 ? '[ ON ]' : '[ OFF ]';
                    html += `
                        <div class="knob-row" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                            <label style="font-size: 0.6rem; color: var(--text-color);">${ctrl.label}</label>
                            <button class="sys-toggle" data-param="${ctrl.id}" style="background: none; padding: 2px 10px; font-size: 0.6rem; font-family: inherit; cursor: pointer; border-radius: 2px; ${active}">
                                ${text}
                            </button>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="knob-row" style="margin-bottom: 12px;">
                            <label style="display: block; font-size: 0.6rem; margin-bottom: 5px; color: var(--text-color);">${ctrl.label}</label>
                            <input type="range" class="sys-knob" data-param="${ctrl.id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}" style="width: 100%; accent-color: var(--accent-color);">
                        </div>
                    `;
                }
            });
        });
        
        panel.innerHTML = html;

        // Listeners for real-time visual sync
        panel.querySelectorAll('.sys-knob').forEach(knob => {
            knob.oninput = (e) => {
                const param = e.target.getAttribute('data-param');
                const val = parseFloat(e.target.value);
                if (window.CRT_CONFIG) window.CRT_CONFIG[param] = val;
                this.params[param] = val;
            };
        });

        panel.querySelectorAll('.sys-toggle').forEach(btn => {
            btn.onclick = (e) => {
                const param = e.target.getAttribute('data-param');
                const currentVal = this.params[param] || 0;
                const newVal = currentVal > 0.5 ? 0 : 1;
                
                if (window.CRT_CONFIG) window.CRT_CONFIG[param] = newVal;
                this.params[param] = newVal;
                
                // Update UI visually
                e.target.style.color = newVal > 0.5 ? '#00FFFF' : 'rgba(255,255,255,0.3)';
                e.target.style.borderColor = newVal > 0.5 ? '#00FFFF' : 'rgba(255,255,255,0.1)';
                e.target.innerText = newVal > 0.5 ? '[ ON ]' : '[ OFF ]';
                
                // If it's the contrast boost, trigger a visual pop
                if (param === 'boost-contrast' && window.CRT_BURST) window.CRT_BURST();
            };
        });

        return panel;
    }
}

// Global exposure
window.SYSTEM_CALIBRATE = new SystemCalibrator();
