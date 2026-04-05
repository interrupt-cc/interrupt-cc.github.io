/**
 * horizon.js - Stable 3D Perspective Ocean Mesh
 * Fixed-structure perspective with isolated auditory deformation.
 */

class Ripple {
    constructor(x, z, angle, color) {
        this.x = x;
        this.z = z;
        this.angle = angle || Math.random() * Math.PI * 2;
        this.color = color || '#00FFFF';
        this.age = 0;
        this.maxAge = 150; // frames
        this.peakAmp = 25 + Math.random() * 35;
        this.wavelength = 0.15; // Spatial frequency
    }

    update() {
        this.age++;
        return this.age < this.maxAge;
    }

    getAmplitude() {
        const life = this.age / this.maxAge;
        return this.peakAmp * Math.sin(life * Math.PI);
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
        this.colorIdx = 0;
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
        const angle = (Math.random() - 0.5) * Math.PI * 0.6;
        this.ripples.push(new Ripple(0, 0, angle, this.palette[this.colorIdx % this.palette.length]));
        this.colorIdx++;
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

        // 3. Audio-active ripples (Transient Peaks)
        this.ripples.forEach(r => {
            const rx = x * Math.cos(r.angle) + z * Math.sin(r.angle);
            // Combine ripple-local wavelength with global multiplier
            const phi = (r.wavelength * (this.globalWavelength / 0.15)) * rx - (this.time * 0.12);
            // Attenuate by 25% (0.75x) to prevent excessive displacement
            yOffset += Math.sin(phi) * r.getAmplitude() * activityScale * 0.75;
        });

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
        this.draw();
        this.ripples = this.ripples.filter(r => r.update());
        requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Reset with Trails
        ctx.fillStyle = 'rgba(8, 9, 10, 0.25)'; 
        ctx.fillRect(0, 0, w, h);

        const rms = window.STOCHASTIC_AUDIO?.currentRMS || 0;
        const cloudEnv = window.STOCHASTIC_AUDIO?.currentCloudEnv || 0;
        // Middle Third of RMS (approx 0.25 to 0.70 range)
        const midRMS = Math.max(0, Math.min(1.0, (rms - 0.25) / 0.45));

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
                const edgeColor = (this.ripples.length > 0) ? this.ripples[0].color : '#00FFFF';
                ctx.strokeStyle = edgeColor + Math.floor(alpha * 160).toString(16).padStart(2, '0');
                ctx.stroke();
            }
        }
    }
}

// Global Export
window.HORIZON = new HorizonGrid('horizon-grid');
