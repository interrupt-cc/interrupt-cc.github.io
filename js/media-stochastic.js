/**
 * media-stochastic.js - Stochastic Media Engine (SME)
 * Sample -> Effect -> Composite with ADSR temporal envelopes.
 */

class MediaSlot {
    constructor(canvas, image, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.image = image;
        this.config = config; 

        // Important: Ensure dimensions are non-zero immediately
        if (this.ctx.canvas.width === 0) {
            this.ctx.canvas.width = window.innerWidth;
            this.ctx.canvas.height = window.innerHeight;
        }

        this.init();
    }

    init() {
        const cw = this.ctx.canvas.width;
        const ch = this.ctx.canvas.height;
        const imgW = this.image.width;
        const imgH = this.image.height;

        // --- 1. SAMPLE STAGE: Aesthetic Dimensionality ---
        const minDim = 0.25; 
        const sw = imgW * (minDim + Math.random() * (1.0 - minDim));
        const sh = imgH * (minDim + Math.random() * (1.0 - minDim));
        const sx = Math.random() * (imgW - sw);
        const sy = Math.random() * (imgH - sh);

        // Uniform scale tracking relative to structural viewport widths
        let dw = cw * (0.3 + Math.random() * 0.4);
        let dh = dw * (sh / sw); 

        if (Math.random() < 0.15) {
            dw *= (0.5 + Math.random());
            dh *= (0.5 + Math.random());
        }

        const dx = Math.random() * (cw - dw);
        const dy = Math.random() * (ch - dh);

        this.rect = { sx, sy, sw, sh, dx, dy, dw, dh };

        // --- 2. TEMPORAL ENVELOPE & KINEMATICS ---
        const now = performance.now();
        // Calculate logical ADSR phases first
        const attack = 1000 + Math.random() * 2000;
        const hold = 2000 + Math.random() * 5000; // Random hold time
        const release = 2000 + Math.random() * 3000;
        
        this.life = {
            start: now,
            attack: attack,
            hold: hold,
            release: release,
            duration: attack + hold + release // Hard sync kill duration to envelope sum
        };

        // Amoeba Ambling parameters
        this.angle = Math.random() * Math.PI * 2;
        this.vx = (Math.random() - 0.5) * 0.3; 
        this.vy = (Math.random() - 0.5) * 0.3;
        
        // Kinematic state
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        
        // Randomize physical distortion type (33% Stretch X, 33% Stretch Y, 33% Rotate)
        const distortChoice = Math.random();
        if (distortChoice < 0.33) {
            this.vScaleX = (Math.random() * 0.0004) + 0.0001; // Positive stretch ONLY
            this.vScaleY = 0;
            this.vAngle = 0;
        } else if (distortChoice < 0.66) {
            this.vScaleX = 0;
            this.vScaleY = (Math.random() * 0.0004) + 0.0001;
            this.vAngle = 0;
        } else {
            this.vScaleX = 0;
            this.vScaleY = 0;
            this.vAngle = (Math.random() - 0.5) * 0.001; // Ultra slow, barely perceptible rotation
        }

        this.effectType = Math.random() > 0.5 ? 'DIAGONAL_GRAD' : 'PIXELATE';
        this.alive = true;

        // --- 2. DESTRUCTIVE EDIT STAGE (Pre-Render) ---
        // Sticking to a simple 3-step pipeline: Grab sample -> Destructive Edit -> Composite.
        const tw = Math.min(2048, dw);
        const th = Math.min(2048, dh);
        
        this.patchCanvas = document.createElement('canvas');
        this.patchCanvas.width = tw;
        this.patchCanvas.height = th;
        const pCtx = this.patchCanvas.getContext('2d');

        // A. Apply Dynamic Brcosa
        pCtx.filter = `brightness(110%) contrast(120%) saturate(120%)`;
        pCtx.drawImage(this.image, sx, sy, sw, sh, 0, 0, tw, th);
        pCtx.filter = 'none';

        // B. Ghost Signal Effects
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = tw;
        tempCanvas.height = th;
        const tempCtx = tempCanvas.getContext('2d');

        if (this.effectType === 'PIXELATE') {
            const lowScale = 0.12 + Math.random() * 0.1;
            const lw = Math.max(1, Math.floor(tw * lowScale));
            const lh = Math.max(1, Math.floor(th * lowScale));
            
            tempCtx.drawImage(this.patchCanvas, 0, 0, tw, th, 0, 0, lw, lh);
            pCtx.clearRect(0, 0, tw, th);
            pCtx.imageSmoothingEnabled = false;
            pCtx.drawImage(tempCtx.canvas, 0, 0, lw, lh, 0, 0, tw, th);
            tempCtx.clearRect(0, 0, tw, th);
        } else {
            const iGrad = pCtx.createLinearGradient(0, 0, tw, th);
            iGrad.addColorStop(0, 'rgba(0,0,0,0)');
            iGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
            iGrad.addColorStop(1, 'rgba(0,0,0,0)');
            pCtx.globalCompositeOperation = 'overlay';
            pCtx.fillStyle = iGrad;
            pCtx.fillRect(0, 0, tw, th);
            pCtx.globalCompositeOperation = 'source-over';
        }

        // C. Organic Mask (Cloud of Pixels)
        tempCtx.globalCompositeOperation = 'source-over';
        const centerX = tw / 2;
        const centerY = th / 2;
        const radius = Math.min(tw, th) * 0.45;

        const grad = tempCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.2, 'rgba(255,255,255,1)'); 
        grad.addColorStop(0.7, 'rgba(255,255,255,0.4)'); 
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        tempCtx.fillStyle = grad;
        tempCtx.fillRect(0, 0, tw, th);

        tempCtx.globalCompositeOperation = 'destination-out';
        const pixelCount = 1200 + Math.floor(Math.random() * 800);
        for (let i = 0; i < pixelCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            
            // Use quadratic radial distribution to push density outwards 
            // without creating a hard circular boundary (removes donut hole)
            const rOffset = Math.pow(Math.random(), 0.6); 
            const dist = rOffset * radius * 1.1; 
            
            const px = centerX + Math.cos(angle) * dist;
            const py = centerY + Math.sin(angle) * dist;
            
            // Diffuse scale and softer transparencies for less intrusive squares
            const sizeWidth = 2 + Math.random() * 60;
            const sizeHeight = 2 + Math.random() * 60;
            const alpha = 0.1 + Math.random() * 0.4; 
            
            tempCtx.fillStyle = `rgba(0,0,0, ${alpha})`;
            tempCtx.fillRect(px - sizeWidth / 2, py - sizeHeight / 2, sizeWidth, sizeHeight);
        }
        
        pCtx.globalCompositeOperation = 'destination-in';
        pCtx.drawImage(tempCtx.canvas, 0, 0, tw, th, 0, 0, tw, th);
    }

    update(now) {
        const elapsed = now - this.life.start;
        if (elapsed > this.life.duration) {
            this.alive = false;
            return;
        }

        // Amoeba Ambling
        this.rect.dx += this.vx;
        this.rect.dy += this.vy;
        this.angle += this.vAngle;
        this.scaleX += this.vScaleX;
        this.scaleY += this.vScaleY;

        if (elapsed < this.life.attack) {
            this.alpha = elapsed / this.life.attack;
        } else if (elapsed < this.life.attack + this.life.hold) {
            this.alpha = 1.0;
        } else {
            const releaseElapsed = elapsed - (this.life.attack + this.life.hold);
            this.alpha = Math.max(0, 1.0 - (releaseElapsed / this.life.release));
        }
    }

    // --- 3. COMPOSITE STAGE ---
    draw() {
        if (!this.alive) return;

        const ctx = this.ctx;
        const { dx, dy, dw, dh } = this.rect;
        
        ctx.save();
        ctx.globalAlpha = Math.min(1.0, this.alpha * 1.5); 
        ctx.globalCompositeOperation = this.blendMode; 
        
        // Pivot to center of fragment for rotation & scale
        const cx = dx + dw / 2;
        const cy = dy + dh / 2;
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.scale(this.scaleX, this.scaleY);
        
        // Draw the static patch (centered on the translated pivot)
        ctx.drawImage(this.patchCanvas, 0, 0, this.patchCanvas.width, this.patchCanvas.height, -dw / 2, -dh / 2, dw, dh);
        
        ctx.restore();
    }
}

class MediaEngine {
    constructor() {
        this.canvas = document.getElementById('crt-media');
        if (!this.canvas) return;
        
        // Immediate dimension lock to prevent 0-scale init bug
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.ctx = this.canvas.getContext('2d');
        this.config = window.CRT_CONFIG || { engineSlide: 0 };

        // Harvesting sources from the automated manifest
        this.assetPaths = window.STOCHASTIC_MEDIA_MANIFEST || [];
        
        if (this.assetPaths.length === 0) {
            console.warn('SME: No media found in manifest. Check visuals/ directory or run tools/index-media.js');
        }

        this.imageCache = new Map(); // JIT Cache 
        this.slots = [];
        this.maxSlots = 4; // Reduced slightly for JIT efficiency
        this.lastSpawn = 0;
        this.spawning = false; // Prevents overlapping spawn loads

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async spawn() {
        if (this.assetPaths.length === 0 || this.spawning) return;
        this.spawning = true;

        const path = this.assetPaths[Math.floor(Math.random() * this.assetPaths.length)];
        
        try {
            let img;
            if (this.imageCache.has(path)) {
                img = this.imageCache.get(path);
            } else {
                img = await this.loadImage(path);
                if (img) this.imageCache.set(path, img);
            }

            if (img && img.naturalWidth > 0) {
                console.log('SME: JIT Spawn from', path.split('/').pop());
                this.slots.push(new MediaSlot(this.canvas, img, this.config));
            }
        } catch (e) {
            console.error('SME: JIT Load failed for', path, e);
        } finally {
            this.spawning = false;
        }
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = src;
        });
    }

    animate() {
        const now = performance.now();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Spawn logic: every 3-7 seconds if slot available
        if (this.slots.length < this.maxSlots && now - this.lastSpawn > 3000 + Math.random() * 4000) {
            this.spawn();
            this.lastSpawn = now;
        }

        this.slots = this.slots.filter(s => {
            s.update(now);
            s.draw();
            return s.alive;
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Global initialization
window.addEventListener('load', () => {
    window.STOCHASTIC_MEDIA_ENGINE = new MediaEngine();
});
