/**
 * horizon.js - Stable 3D Perspective Ocean Mesh
 * Fixed-structure perspective with isolated auditory deformation.
 */

class Ripple {
    constructor(x, z, type = 'DIRECTIONAL', angle = 0, color = '#00FFFF') {
        this.x = x;
        this.z = z;
        this.type = type; // 'DIRECTIONAL' or 'CIRCULAR'
        this.angle = angle || Math.random() * Math.PI * 2;
        this.color = color;
        this.age = 0;
        this.maxAge = type === 'CIRCULAR' ? 60 : 150; // Rain decays faster
        this.peakAmp = type === 'CIRCULAR' ? (4 + Math.random() * 8) : (25 + Math.random() * 35);
        this.wavelength = type === 'CIRCULAR' ? 0.35 : 0.15; 
    }

    update() {
        this.age++;
        return this.age < this.maxAge;
    }

    getAmplitude() {
        const life = this.age / this.maxAge;
        // Circular ripples (rain) use a tighter peak-then-fade envelope
        const env = this.type === 'CIRCULAR' ? Math.sin(life * Math.PI) * (1.0 - life) : Math.sin(life * Math.PI);
        return this.peakAmp * env;
    }
}

class HorizonGrid {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.onResize();
        this.focalLength = 400;
        
        this.ripples = [];
        this.palette = ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00', '#FF0000', '#5555FF'];
        
        // Multi-Mode Color State
        this.currentColor = '#00FFFF';
        this.isGradient = false;
        this.gradientColors = ['#00FFFF', '#FF00FF'];
        this.colorIdx = 0; // Sequential cycle for Analog restoration
        this.engineSlide = 0; // 0 = Analog, 1 = Digital (Interpolated)
        
        this.time = 0;
        
        // Structural Wave Params
        this.globalWavelength = 0.15;
        this.edgeDamping = 0.0; // 0=Ribbon, 1+=Captured/Contained

        window.addEventListener('resize', () => this.onResize());
        
        // Tactile Resonance
        this.canvas.addEventListener('mousedown', () => this.triggerRipple());
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.triggerRipple();
        });
        
        // Robust Initialization: Fix for "Only shows up on DevTools/Resize"
        this.onResize();
        setTimeout(() => this.onResize(), 100);
        window.addEventListener('load', () => this.onResize());
        
        this.animate();
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.vanishX = this.width / 2;
        this.vanishY = this.height * 0.33; // Upper two-thirds (mapped to 1/3 from top)
        
        // Pushing the "Near Plane" pivot point further back (to Z=15)
        // so that the actual start of the grid (Z=10) is already "behind/below" the viewer.
        this.zStart = 15;
        this.groundY = - (this.height - this.vanishY) * this.zStart / this.focalLength;
        this.zStart = 10; // Reset zStart to 10 for the loop pivot
    }

    triggerRipple() {
        const boost = window.CRT_CONFIG?.['boost-contrast'] || 0;
        
        if (boost > 0.5) {
            // [ DIGITAL ENGINE ] - Weighted Stochastic Color Selection
            const r = Math.random();
            if (r < 0.70) {
                // 70% Favor Cyan
                this.currentColor = '#00FFFF';
                this.isGradient = false;
            } else if (r < 0.90) {
                // 20% Gradient
                this.isGradient = true;
                this.gradientColors = [
                    this.palette[Math.floor(Math.random() * this.palette.length)],
                    this.palette[Math.floor(Math.random() * this.palette.length)]
                ];
            } else {
                // 10% Random Solid
                this.currentColor = this.palette[Math.floor(Math.random() * this.palette.length)];
                this.isGradient = false;
            }
        } else {
            // [ ANALOG ENGINE ] - Faithful Sequential Cycle Restoration
            const idx = this.colorIdx % this.palette.length;
            this.currentColor = this.palette[idx];
            this.isGradient = false;
            this.colorIdx++;
        }

        const angle = (Math.random() - 0.5) * Math.PI * 0.6;
        this.ripples.push(new Ripple(0, 0, 'DIRECTIONAL', angle, this.isGradient ? this.gradientColors[0] : this.currentColor));
    }

    project(x, y, z) {
        if (z < 0.1) return null; // Discard points behind or too close to camera
        const scale = this.focalLength / z;
        return {
            x: this.vanishX + x * scale,
            y: this.vanishY - y * scale, 
            scale: scale
        };
    }

    getDeformation(x, z, activityScale, cloudEnv, maxZ, midRMS) {
        let yOffset = 0;
        
        // 1. Permanent 'Idol Swell' (Now undulating TOWARDS the viewer)
        yOffset += Math.sin(z * 0.05 + this.time * 0.02) * 8;
        
        // 2. Audio Mid-Swell (Middle 3rd of RMS)
        // Faster, tighter wave reflecting the body of the audio output (Magnitude ~12-15)
        const midSwellPhi = z * 0.12 + this.time * 0.06;
        yOffset += Math.sin(midSwellPhi) * (12 * midRMS);

        // 3. Audio-active ripples (Transient Peaks & Rain Drops)
        let trigSum = 0;
        this.ripples.forEach(r => {
            if (r.type === 'CIRCULAR') {
                const d = Math.sqrt(Math.pow(x - r.x, 2) + Math.pow(z - r.z, 2));
                const phi = d * r.wavelength - (this.time * 0.15);
                trigSum += Math.sin(phi) * r.getAmplitude() * activityScale * 0.5;
            } else {
                const rx = x * Math.cos(r.angle) + z * Math.sin(r.angle);
                const phi = (r.wavelength * (this.globalWavelength / 0.15)) * rx - (this.time * 0.12);
                trigSum += Math.sin(phi) * r.getAmplitude() * activityScale * 0.5;
            }
        });
        
        // Final Master Compression: prevent additive "blowouts" when multiple ripples overlap
        yOffset += Math.tanh(trigSum / 35.0) * 35.0;

        // 3. Cloud-peak Jitter
        const jitter = (Math.random() - 0.5) * 5.0 * cloudEnv;
        
        // 4. Edge Damping (Containment)
        // Modified: Only damp the far edge (horizon). Foreground stays active.
        const zNorm = Math.min(1.0, Math.max(0, (z - this.zStart) / (maxZ * 0.8 - this.zStart)));
        // Half-sin window: 1 at the front, 0 at the horizon
        const window = 1.0 - Math.pow(zNorm, 2.0); 
        
        return this.groundY + (yOffset + jitter) * window;
    }

    animate() {
        this.time += 1.0;
        
        // --- INTERPOLATED ENGINE TRANSITION ---
        const targetBoost = window.CRT_CONFIG?.['boost-contrast'] || 0;
        this.engineSlide += (targetBoost - this.engineSlide) * 0.08;

        this.draw();
        this.ripples = this.ripples.filter(r => r.update());
        requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // --- DYNAMIC BACKGROUND FADES (Interpolated Restoration) ---
        // Analog: rgba(8,9,10,0.25) -> Digital: rgba(0,0,0,0.15)
        const slide = this.engineSlide || 0;
        const grayVal = Math.floor(8 * (1.0 - slide));
        const alphaVal = 0.25 - (0.10 * slide);
        ctx.fillStyle = `rgba(${grayVal}, ${grayVal + 1}, ${grayVal + 2}, ${alphaVal})`;
        ctx.fillRect(0, 0, w, h);

        const rms = window.STOCHASTIC_AUDIO?.currentRMS || 0;
        const cloudEnv = window.STOCHASTIC_AUDIO?.currentCloudEnv || 0;
        
        // Dynamic Range Mapping
        const lowRMS = Math.max(0, Math.min(1.0, (0.35 - rms) / 0.35)); // Energy in bottom 1/3
        const midRMS = Math.max(0, Math.min(1.0, (rms - 0.25) / 0.45)); // Energy in middle 1/3

        // Audio Rainfall Spawner (Stochastic pocks on the grid)
        if (Math.random() < lowRMS * 0.12) {
            const rx = (Math.random() - 0.5) * 400; // X spread
            const rz = this.zStart + Math.random() * 120; // Z depth
            this.ripples.push(new Ripple(rx, rz, 'CIRCULAR', 0, '#00FFFF'));
        }

        // activityScale ONLY affects deformation amplitude
        const activityScale = 0.5 + (rms * 4.0) + (cloudEnv * 3.0);
        
        const rows = 30; // Z steps
        const cols = 28; // X steps
        const stepZ = 12.0;
        const stepX = 25.0;

        // Draw mesh - BACK-TO-FRONT for correct layering (Painter's Algorithm)
        for (let zI = rows - 2; zI >= -8; zI--) {
            const scroll = (this.time * 0.8) % stepZ;
            const zN = (zI * stepZ) + scroll + this.zStart;
            const zF = ((zI + 1) * stepZ) + scroll + this.zStart;
            if (zN < 0.1) continue;

            const maxZ = (rows * stepZ) + this.zStart;
            // Opacity is stable by Z distance only
            const alpha = Math.min(0.8, Math.max(0, 1.0 - (zN / maxZ))) * 1.0;
            if (alpha <= 0.05) continue;

            for (let xI = -cols/2; xI < cols/2; xI++) {
                const xL = xI * stepX;
                const xR = (xI + 1) * stepX;

                // Points of the mesh quad
                const p1 = this.project(xL, this.getDeformation(xL, zN, activityScale, cloudEnv, maxZ, midRMS), zN);
                const p2 = this.project(xR, this.getDeformation(xR, zN, activityScale, cloudEnv, maxZ, midRMS), zN);
                const p3 = this.project(xR, this.getDeformation(xR, zF, activityScale, cloudEnv, maxZ, midRMS), zF);
                const p4 = this.project(xL, this.getDeformation(xL, zF, activityScale, cloudEnv, maxZ, midRMS), zF);

                if (!p1 || !p2 || !p3 || !p4) continue;

                // Draw quad
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.lineTo(p4.x, p4.y);
                ctx.closePath();

                // Surface
                ctx.fillStyle = `rgba(0, 139, 163, ${alpha * 0.2})`;
                ctx.fill();

                // Edges
                ctx.lineWidth = Math.min(1.5, p1.scale * 0.05);
                
                const slide = this.engineSlide || 0;
                if (slide > 0.5) {
                    // DEEP BLACK ENGINE: Black lines
                    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`;
                } else {
                    // Standard color mode
                    if (this.isGradient) {
                        const grad = ctx.createLinearGradient(p1.x, p1.y, p3.x, p3.y);
                        grad.addColorStop(0, this.gradientColors[0]);
                        grad.addColorStop(1, this.gradientColors[1]);
                        ctx.strokeStyle = grad;
                    } else {
                        ctx.strokeStyle = this.currentColor + Math.floor(alpha * 160).toString(16).padStart(2, '0');
                    }
                }
                ctx.stroke();
            }
        }
    }
}

// Global Export
window.HORIZON = new HorizonGrid('horizon-grid');
