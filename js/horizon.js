/**
 * horizon.js - Space Harrier Perspective Grid
 * 2D Canvas with 'acid-frying' jitter and RMS-reactive ripples.
 */

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
        this.ripples.push({
            x: 0,
            z: 0, 
            age: 0,
            color: this.palette[this.colorIdx % this.palette.length]
        });
        this.colorIdx++;
        if (this.ripples.length > 5) this.ripples.shift();
    }

    animate() {
        this.time += 0.05;
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // 1. Burn-in Trails (Acid feel)
        ctx.fillStyle = 'rgba(8, 9, 10, 0.15)'; // Match --bg-color
        ctx.fillRect(0, 0, w, h);

        // 2. Fetch real-time RMS + Cloud Envelope for 'Storm' scaling
        const rms = window.STOCHASTIC_AUDIO?.currentRMS || 0;
        const cloudEnv = window.STOCHASTIC_AUDIO?.currentCloudEnv || 0;
        
        // Activity scale: RMS is baseline, CloudEnv is a massive multiplier
        const activityScale = (rms * 4.0) + (cloudEnv * 3.5);
        
        ctx.lineWidth = 1;

        // 3. Render Perspective Mesh
        const rows = 24;
        const cols = 28;
        
        // Z-axis from background to foreground
        for (let zI = 0; zI < rows; zI++) {
            const zPct = zI / rows;
            const z = (zI + (this.time * 0.4) % 1) / rows; // Movement scrolling
            const screenY = this.vanishY + z * (h / 2);
            
            // Horizontal Line
            ctx.beginPath();
            let first = true;
            for (let xI = -cols/2; xI <= cols/2; xI++) {
                const worldX = xI * (w / 12);
                const projectedX = this.vanishX + (worldX * z);
                
                // Add Ripple + Cloud Storm deformation
                let yOffset = 0;
                this.ripples.forEach(r => {
                    const dist = Math.sqrt(xI * xI + (zI - 12) * (zI - 12));
                    // Base amplitude (50px) scaled by activity
                    yOffset += Math.sin(dist - r.age) * (50 * activityScale) * Math.exp(-r.age * 0.08);
                });

                // Acid Jitter (Spectal Dissolution during clouds)
                const jitterIntensity = 2.0 * activityScale * (1.0 + cloudEnv * 4.0);
                const jitter = (Math.random() - 0.5) * jitterIntensity;
                
                const finalX = projectedX + jitter;
                const finalY = screenY + yOffset + jitter;

                if (first) ctx.moveTo(finalX, finalY);
                else ctx.lineTo(finalX, finalY);
                first = false;
            }
            // Glow intensity increases with cloud activity
            const alpha = (z * 0.5 * activityScale) + 0.05;
            ctx.strokeStyle = `rgba(0, 229, 255, ${Math.min(0.8, alpha)})`;
            ctx.stroke();
        }

        // Vertical lines (Perspective Rays)
        for (let xI = -cols/2; xI <= cols/2; xI++) {
            ctx.beginPath();
            let first = true;
            for (let zI = 0; zI < rows; zI++) {
                const z = zI / rows;
                const worldX = xI * (w / 12);
                const projectedX = this.vanishX + (worldX * z);
                const screenY = this.vanishY + z * (h / 2);
                
                let yOffset = 0;
                this.ripples.forEach(r => {
                    const dist = Math.sqrt(xI * xI + (zI - 10) * (zI - 10));
                    yOffset += Math.sin(dist - r.age) * (50 * activityScale) * Math.exp(-r.age * 0.08);
                });

                const jitterIntensity = 1.5 * activityScale * (1.0 + cloudEnv * 2.0);
                const jitter = (Math.random() - 0.5) * jitterIntensity;
                const finalX = projectedX + jitter;
                const finalY = screenY + yOffset + jitter;

                if (first) ctx.moveTo(finalX, finalY);
                else ctx.lineTo(finalX, finalY);
                first = false;
            }
            // Fade-in color from ripples + cloud peaks
            const baseColor = this.ripples.length > 0 ? this.ripples[0].color : '#00FFFF';
            const rippleAlpha = Math.min(1.0, activityScale * 0.4);
            ctx.strokeStyle = baseColor + Math.floor(rippleAlpha * 255).toString(16).padStart(2, '0');
            ctx.stroke();
        }

        // Advance ripples
        this.ripples.forEach(r => r.age += 0.2);
        this.ripples = this.ripples.filter(r => r.age < 30);
    }
}

// Global Export
window.HORIZON = new HorizonGrid('horizon-grid');
