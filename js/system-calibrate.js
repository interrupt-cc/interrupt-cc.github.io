/**
 * system-calibrate.js - High-Fidelity CRT & Glitch Controller
 * Real-time hardware drawer for visual aesthetic tuning.
 */

class SystemCalibrator {
    constructor() {
        this.isOpen = false;
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
            'g-alpha': 0.3
        };
        this.injectUI();
    }

    injectUI() {
        const drawer = document.createElement('div');
        drawer.id = 'calibrate-drawer';
        drawer.style.cssText = `
            position: fixed;
            top: 0;
            right: -320px;
            width: 300px;
            height: 100vh;
            background: rgba(10, 15, 20, 0.95);
            backdrop-filter: blur(15px);
            border-left: 1px solid var(--accent-color);
            z-index: 1000;
            transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            padding: 20px;
            overflow-y: auto;
            font-family: 'JetBrains Mono', monospace;
            color: var(--text-color);
            box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
        `;

        const header = `
            <div style="font-size: 0.8rem; color: var(--accent-color); letter-spacing: 3px; border-bottom: 1px solid rgba(0, 229, 255, 0.2); padding-bottom: 10px; margin-bottom: 20px;">
                [ SYSTEM_CALIBRATE ]
            </div>
        `;

        const sections = [
            {
                title: 'SIGNAL_GEOMETRY',
                controls: [
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

        html += `<button id="btn-close-cal" class="sp-btn" style="width: 100%; margin-top: 20px;">DISPATCH_STATE</button>`;
        
        drawer.innerHTML = html;
        document.body.appendChild(drawer);

        // Event Listeners
        drawer.querySelectorAll('.sys-knob').forEach(knob => {
            knob.oninput = (e) => {
                const param = e.target.getAttribute('data-param');
                const val = parseFloat(e.target.value);
                window.CRT_CONFIG[param] = val;
                this.params[param] = val;
            };
        });

        document.getElementById('btn-close-cal').onclick = () => this.toggle();
    }

    toggle() {
        this.isOpen = !this.isOpen;
        const drawer = document.getElementById('calibrate-drawer');
        if (drawer) {
            drawer.style.right = this.isOpen ? '0px' : '-320px';
        }
    }
}

// Global exposure
window.SYSTEM_CALIBRATE = new SystemCalibrator();
