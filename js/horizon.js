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
        
        this.animate();
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.vanishX = this.width / 2;
        this.vanishY = this.height / 2; // Center horizon
        
        // Calculate ground plane world-Y needed to hit the bottom of screen at Z=10
        this.zStart = 10;
        this.groundY = - (this.height - this.vanishY) * this.zStart / this.focalLength;
    }

    triggerRipple() {
        const angle = (Math.random() - 0.5) * Math.PI * 0.6;
        this.ripples.push(new Ripple(0, 0, angle, this.palette[this.colorIdx % this.palette.length]));
        this.colorIdx++;
    }

    project(x, y, z) {
        const scale = this.focalLength / Math.max(0.1, z);
        return {
            x: this.vanishX + x * scale,
            y: this.vanishY - y * scale, // Subtract y because screen space y is downward
            scale: scale
        };
    }

    getDeformation(x, z, activityScale, cloudEnv, maxZ) {
        let yOffset = 0;
        
        // 1. Permanent 'Idol Swell'
        yOffset += Math.sin(z * 0.05 - this.time * 0.02) * 8;
        
        // 2. Audio-active ripples
        this.ripples.forEach(r => {
            const rx = x * Math.cos(r.angle) + z * Math.sin(r.angle);
            // Combine ripple-local wavelength with global multiplier
            const phi = (r.wavelength * (this.globalWavelength / 0.15)) * rx - (this.time * 0.12);
            yOffset += Math.sin(phi) * r.getAmplitude() * activityScale;
        });

        // 3. Cloud-peak Jitter
        const jitter = (Math.random() - 0.5) * 5.0 * cloudEnv;
        
        // 4. Edge Damping (Containment)
        // sin window from 0 to 1 over the z-depth
        const zNorm = Math.min(1.0, Math.max(0, (z - this.zStart) / (maxZ - this.zStart)));
        const window = Math.pow(Math.sin(zNorm * Math.PI), this.edgeDamping);
        
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
        // activityScale ONLY affects deformation amplitude
        const activityScale = 0.5 + (rms * 4.0) + (cloudEnv * 3.0);
        
        const rows = 30; // Z steps
        const cols = 28; // X steps
        const stepZ = 12.0;
        const stepX = 25.0;

        for (let zI = 0; zI < rows - 1; zI++) {
            const scroll = (this.time * 0.8) % stepZ;
            const zN = (zI * stepZ) + scroll + this.zStart;
            const zF = ((zI + 1) * stepZ) + scroll + this.zStart;

            // Opacity is stable by Z distance only
            const alpha = Math.max(0, 1.0 - (zN / (rows * stepZ))) * 0.8;
            if (alpha <= 0.05) continue;

            const maxZ = (rows * stepZ) + this.zStart;

            for (let xI = -cols/2; xI < cols/2; xI++) {
                const xL = xI * stepX;
                const xR = (xI + 1) * stepX;

                // Points of the mesh quad
                const p1 = this.project(xL, this.getDeformation(xL, zN, activityScale, cloudEnv, maxZ), zN);
                const p2 = this.project(xR, this.getDeformation(xR, zN, activityScale, cloudEnv, maxZ), zN);
                const p3 = this.project(xR, this.getDeformation(xR, zF, activityScale, cloudEnv, maxZ), zF);
                const p4 = this.project(xL, this.getDeformation(xL, zF, activityScale, cloudEnv, maxZ), zF);

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
