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

        // 2. Fetch real-time RMS for 'Activity Calmer/Wilder' scaling
        const rms = window.STOCHASTIC_AUDIO?.currentRMS || 0;
        const activityScale = Math.min(1.0, rms * 5.0); // Amplify for visual impact
        
        ctx.lineWidth = 1;

        // 3. Render Perspective Mesh
        const rows = 20;
        const cols = 26;
        
        // Z-axis from background to foreground
        for (let zI = 0; zI < rows; zI++) {
            const z = (zI + (this.time * 0.5) % 1) / rows; // Movement scrolling
            const screenY = this.vanishY + z * (h / 2);
            
            // Horizontal Line
            ctx.beginPath();
            let first = true;
            for (let xI = -cols/2; xI <= cols/2; xI++) {
                const worldX = xI * (w / 10);
                const projectedX = this.vanishX + (worldX * z);
                
                // Add Ripple + Acid Frying deformation
                let yOffset = 0;
                this.ripples.forEach(r => {
                    const dist = Math.sqrt(xI * xI + (zI - 10) * (zI - 10));
                    yOffset += Math.sin(dist - r.age) * (20 * activityScale) * Math.exp(-r.age * 0.1);
                });

                // Acid Jitter
                const jitter = (Math.random() - 0.5) * 2 * activityScale;
                const finalX = projectedX + jitter;
                const finalY = screenY + yOffset + jitter;

                if (first) ctx.moveTo(finalX, finalY);
                else ctx.lineTo(finalX, finalY);
                first = false;
            }
            ctx.strokeStyle = `rgba(0, 229, 255, ${z * 0.4 * activityScale + 0.1})`;
            ctx.stroke();
        }

        // Vertical lines (Perspective Rays)
        for (let xI = -cols/2; xI <= cols/2; xI++) {
            ctx.beginPath();
            let first = true;
            for (let zI = 0; zI < rows; zI++) {
                const z = zI / rows;
                const worldX = xI * (w / 10);
                const projectedX = this.vanishX + (worldX * z);
                const screenY = this.vanishY + z * (h / 2);
                
                let yOffset = 0;
                this.ripples.forEach(r => {
                    const dist = Math.sqrt(xI * xI + (zI - 10) * (zI - 10));
                    yOffset += Math.sin(dist - r.age) * (20 * activityScale) * Math.exp(-r.age * 0.1);
                });

                const jitter = (Math.random() - 0.5) * 1.5 * activityScale;
                const finalX = projectedX + jitter;
                const finalY = screenY + yOffset + jitter;

                if (first) ctx.moveTo(finalX, finalY);
                else ctx.lineTo(finalX, finalY);
                first = false;
            }
            // CMYK selection logic for vertical beams (Acid trip)
            const color = this.ripples.length > 0 ? this.ripples[0].color : '#00FFFF';
            ctx.strokeStyle = color + '22'; // low opacity glow
            ctx.stroke();
        }

        // Advance ripples
        this.ripples.forEach(r => r.age += 0.2);
        this.ripples = this.ripples.filter(r => r.age < 30);
    }
}

// Global Export
window.HORIZON = new HorizonGrid('horizon-grid');
