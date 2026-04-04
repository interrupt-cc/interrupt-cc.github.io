/**
 * horizon.js - True 3D Perspective Ocean Mesh
 * Multi-directional ripple interference with kinetic energy envelopes.
 */

class Ripple {
    constructor(x, z, angle, color) {
        this.x = x;
        this.z = z;
        this.angle = angle || Math.random() * Math.PI * 2;
        this.color = color || '#00FFFF';
        this.age = 0;
        this.maxAge = 120; // frames
        this.peakAmp = 40 + Math.random() * 40;
        this.wavelength = 0.18; // k (Spatial Frequency - near but not same as grid units)
    }

    update() {
        this.age++;
        return this.age < this.maxAge;
    }

    getAmplitude() {
        // Energy Envelope: Sine swell and decay
        const life = this.age / this.maxAge;
        return this.peakAmp * Math.sin(life * Math.PI);
    }
}

class HorizonGrid {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        this.vanishX = this.width / 2;
        this.vanishY = this.height / 2;
        this.focalLength = 350;
        
        this.ripples = [];
        this.palette = ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00', '#FF0000', '#5555FF'];
        this.colorIdx = 0;
        this.time = 0;

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.vanishX = this.width / 2;
        this.vanishY = this.height / 2;
    }

    triggerRipple() {
        // Spawn from various angles for complex interference
        const angle = (Math.random() - 0.5) * Math.PI * 0.5; // Frontal arc
        this.ripples.push(new Ripple(0, 0, angle, this.palette[this.colorIdx % this.palette.length]));
        this.colorIdx++;
    }

    project(x, y, z) {
        // True 3D perspective projection
        // z is distance from viewer
        const scale = this.focalLength / Math.max(0.1, z);
        return {
            x: this.vanishX + x * scale,
            y: this.vanishY + y * scale,
            scale: scale
        };
    }

    getDeformation(x, z, activityScale, cloudEnv) {
        let yOffset = 0;
        this.ripples.forEach(r => {
            // Rotated coordinate for directional ripples
            const rx = x * Math.cos(r.angle) + z * Math.sin(r.angle);
            const phi = r.wavelength * rx - (this.time * 0.15);
            
            yOffset += Math.sin(phi) * r.getAmplitude() * activityScale;
        });

        // Acid Frying Jitter
        const jitterIntensity = 2.0 * activityScale * (1.0 + cloudEnv * 5.0);
        const jitter = (Math.random() - 0.5) * jitterIntensity;
        
        return yOffset + jitter;
    }

    animate() {
        this.time += 1.0;
        this.draw();
        
        // Cleanup aged ripples
        this.ripples = this.ripples.filter(r => r.update());
        
        requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // 1. Burn-in Trails
        ctx.fillStyle = 'rgba(8, 9, 10, 0.2)'; 
        ctx.fillRect(0, 0, w, h);

        const rms = window.STOCHASTIC_AUDIO?.currentRMS || 0;
        const cloudEnv = window.STOCHASTIC_AUDIO?.currentCloudEnv || 0;
        const activityScale = (rms * 4.0) + (cloudEnv * 3.5);
        
        // 2. Mesh Configuration
        const rows = 35; // Z depth
        const cols = 40; // X width
        const gridStepZ = 6.0;
        const gridStepX = 15.0;

        // Draw surface as a continuous mesh of quads
        for (let zI = 0; zI < rows - 1; zI++) {
            // Movement scrolling: offset the initial Z
            const scroll = (this.time * 0.5) % gridStepZ;
            const zNear = (zI * gridStepZ) + scroll + 15; // +15 to avoid near-plane clipping
            const zFar = ((zI + 1) * gridStepZ) + scroll + 15;

            // Opacity falls off with distance
            const alpha = Math.max(0, 1.0 - (zNear / 200)) * (activityScale + 0.1);
            if (alpha <= 0) continue;

            for (let xI = -cols/2; xI < cols/2; xI++) {
                const x0 = xI * gridStepX;
                const x1 = (xI + 1) * gridStepX;

                // Vertices of the quad
                const v1 = this.project(x0, this.getDeformation(x0, zNear, activityScale, cloudEnv), zNear);
                const v2 = this.project(x1, this.getDeformation(x1, zNear, activityScale, cloudEnv), zNear);
                const v3 = this.project(x1, this.getDeformation(x1, zFar, activityScale, cloudEnv), zFar);
                const v4 = this.project(x0, this.getDeformation(x0, zFar, activityScale, cloudEnv), zFar);

                // Skip if off-screen or too close
                if (v1.y < this.vanishY) continue;

                // 3. Render Quad
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y);
                ctx.lineTo(v2.x, v2.y);
                ctx.lineTo(v3.x, v3.y);
                ctx.lineTo(v4.x, v4.y);
                ctx.closePath();

                // Surface Fill (Ocean Texture)
                ctx.fillStyle = `rgba(0, 139, 163, ${alpha * 0.15})`;
                ctx.fill();

                // Wireframe Edge
                ctx.lineWidth = Math.min(2, v1.scale * 0.1);
                const baseColor = (this.ripples.length > 0) ? this.ripples[0].color : '#00FFFF';
                ctx.strokeStyle = baseColor + Math.floor(alpha * 180).toString(16).padStart(2, '0');
                ctx.stroke();
            }
        }
    }
}

// Global Export
window.HORIZON = new HorizonGrid('horizon-grid');
