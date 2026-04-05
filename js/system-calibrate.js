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
                    { id: 'boost-contrast', label: 'SIGNAL_CONTRAST_BOOST', min: 0, max: 1, step: 1 },
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
                const val = this.params[ctrl.id] || 0;
                html += `
                    <div class="knob-row" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.6rem; margin-bottom: 5px; color: var(--text-color);">${ctrl.label}</label>
                        <input type="range" class="sys-knob" data-param="${ctrl.id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}" style="width: 100%; accent-color: var(--accent-color);">
                    </div>
                `;
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

        return panel;
    }
}

// Global exposure
window.SYSTEM_CALIBRATE = new SystemCalibrator();
