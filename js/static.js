/**
 * static.js - CRT Static Background Effect
 * High-performance WebGL noise with aberrations and bursts.
 */

const canvas = document.getElementById('crt-static');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.warn('WebGL not supported, falling back to 2D canvas (not implemented).');
}

// Low-resolution for that "digital artifact" chunky look
const RENDER_W = 320;
const RENDER_H = 240;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vsSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const fsSource = `
    precision mediump float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_saturation;
    uniform float u_aberration_offset;
    uniform float u_pinch_factor;
    uniform float u_noise_floor;
    uniform float u_bleed;
    // ghost uniforms
    uniform vec2 u_ghost_pos;
    uniform float u_ghost_alpha;
    uniform float u_ghost_stoch;
    uniform float u_ghost_cbuffer;
    uniform vec2 u_ghost_spread;
    uniform float u_ghost_id;
    uniform float u_boost_contrast;

    float random(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // CRT Geometry Warp: Pincushion Distortion (Pinched Sides)
    vec2 warp(vec2 uv) {
        vec2 centered = uv - 0.5;
        // u_saturation acts as a power surge warp
        float surge = u_saturation * 0.1;
        
        // Use the real-time pinch factor from index.html
        float pinch = u_pinch_factor + surge; 
        uv.x = centered.x * (1.0 + pinch * centered.y * centered.y) + 0.5;
        
        // Subtle barrel on Y for that curved glass feel
        uv.y = centered.y * (1.0 + 0.05 * centered.x * centered.x) + 0.5;
        return uv;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv = warp(uv); 
        
        // 1. Toggled Scanning Modes (Vertical vs Diagonal)
        // Switches every ~6 seconds using a stepped random
        float modeToggle = step(0.5, random(vec2(floor(u_time * 0.16), 11.0)));
        float rollAngle = modeToggle * 0.8; // 0 or ~45 deg
        
        // 2. Primary interference bar
        float rollFreq = 5.0;
        float rollPhase = u_time * 1.5;
        float rollVal = sin((uv.y + uv.x * rollAngle) * rollFreq + rollPhase);
        
        // 3. Vertical Pinch (Electromagnetic distortion)
        // Warps coordinates when near a primary interference peak
        if (rollVal > 0.7) {
            float pinchIntensity = (rollVal - 0.7) * 0.15;
            // Oscillate the pinch slightly for "buzzing" feel
            uv.y += pinchIntensity * sin(u_time * 15.0) * 0.02;
        }

        // 4. Secondary small bars (High speed, vertical only)
        float smallRoll = sin(uv.y * 25.0 - u_time * 6.0);
        
        // Global horizontal aberration
        if (u_aberration_offset > 0.0) {
            float band = step(0.1, random(vec2(floor(uv.y * 15.0), u_time)));
            if (band > 0.5) uv.x += u_aberration_offset;
        }

        // 5. Dynamic Noise and Interference assembly
        // Using the real-time noise floor uniform
        float n = pow(random(uv + fract(u_time * 0.88)), 3.0) * u_noise_floor * 3.0; 
        
        // Randomized brightness intensities
        float primaryBrightness = 0.15 * random(vec2(floor(u_time * 10.0), 3.0));
        float secondaryBrightness = 0.08 * random(vec2(floor(u_time * 14.0), 7.0));
        
        if (rollVal > 0.95) n += primaryBrightness;
        if (smallRoll > 0.99) n += secondaryBrightness;

        // --- CONVERT TO RGB HERE ---
        vec3 color = vec3(n);

        // Saturation burst and standard scanlines
        vec3 finalColor = color + vec3(u_saturation);
        float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.06;
        finalColor -= vec3(scanline);

        // 6. STOCHASTIC PHANTOM CLUSTER (INK CLOUD) - OVERTOP LAYER
        if (u_ghost_alpha > 0.01) {
            vec2 gUv = uv;
            
            // High-Contrast Scintillation Pulse
            float scintillation = 1.0;
            if (u_boost_contrast > 0.5) {
                // High-frequency temporal jitter (60fps)
                scintillation = random(vec2(u_time * 60.0, u_ghost_id));
                scintillation = step(0.3, scintillation); // Sharp flicker
            }

            if (u_ghost_cbuffer > 0.01) {
                float gBand = step(0.1, random(vec2(floor(uv.y * 40.0), u_time * 2.5)));
                if (gBand > 0.5) {
                    float move = u_ghost_cbuffer * (random(vec2(u_time)) - 0.5);
                    gUv.x += move;
                    // If boost is ON, the drift physically warps the signal
                    if (u_boost_contrast > 0.5) uv.x += move * 0.5;
                }
            }

            // ATTRACTOR LOGIC
            vec2 rel = (gUv - u_ghost_pos) / u_ghost_spread;
            float distSq = dot(rel, rel);
            float attractor = exp(-distSq * 2.0); 
            
            float gridRes = 60.0;
            vec2 grid = floor(gUv * gridRes) / gridRes;
            float r = random(grid + u_ghost_id);
            float ghostMask = step(1.0 - (u_ghost_stoch * attractor), r);
            
            if (ghostMask > 0.0) {
                vec2 pUv = grid;
                float hueSeed = random(pUv + 77.0);
                vec3 cmyk;
                if (hueSeed < 0.33) cmyk = vec3(0.0, 1.0, 1.0); 
                else if (hueSeed < 0.66) cmyk = vec3(1.0, 0.0, 1.0); 
                else cmyk = vec3(1.0, 1.0, 0.0); 
                
                float k = random(pUv + 99.0);
                cmyk *= (1.0 - k * 0.2); 
                
                // ADDITIVE BLENDING OVER TOP with Scintillation
                finalColor += cmyk * ghostMask * u_bleed * u_ghost_alpha * 1.5 * scintillation;
            }
        }

        // --- FINAL POST-PROCESSING: SHADOW CRUSHER ---
        if (u_boost_contrast > 0.5) {
            // 1. Criss-Cross Phosphor Lines (Cross-hatch pattern)
            // Using thicker step(0.993, ...) for Mistake-proof visibility
            float gridX = step(0.993, sin(uv.x * 24.0 + u_ghost_id));
            float gridY = step(0.993, sin(uv.y * 24.0 + u_ghost_id * 2.1));
            float crissCross = max(gridX, gridY);
            
            float flicker = step(0.32, random(vec2(u_time * 22.0)));
            finalColor += vec3(0.0, 0.45, 0.65) * crissCross * flicker; // Cyan-ish test lines

            // 2. Apply aggressive non-linear contrast (Crush Blacks)
            finalColor = pow(max(vec3(0.0), finalColor - 0.1), 1.45) * 1.6;
            // 3. Add sharper grain on top of crushed black
            finalColor += vec3(random(uv + u_time) * 0.05);
        }

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
const timeUniformLocation = gl.getUniformLocation(program, "u_time");
const saturationUniformLocation = gl.getUniformLocation(program, "u_saturation");
const aberrationUniformLocation = gl.getUniformLocation(program, "u_aberration_offset");
const pinchUniformLocation = gl.getUniformLocation(program, "u_pinch_factor");
const noiseUniformLocation = gl.getUniformLocation(program, "u_noise_floor");
const bleedUniformLocation = gl.getUniformLocation(program, "u_bleed");
const ghostPosLoc = gl.getUniformLocation(program, "u_ghost_pos");
const ghostAlphaLoc = gl.getUniformLocation(program, "u_ghost_alpha");
const ghostStochLoc = gl.getUniformLocation(program, "u_ghost_stoch");
const ghostCBufferLoc = gl.getUniformLocation(program, "u_ghost_cbuffer");
const ghostSpreadLoc = gl.getUniformLocation(program, "u_ghost_spread");
const ghostIdLoc = gl.getUniformLocation(program, "u_ghost_id");
const boostContrastLoc = gl.getUniformLocation(program, "u_boost_contrast");

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

let saturation = 0;
let isBuilding = false;
let burstMode = 0; // 0: SNAP, 1: BUILD
let pinchSpike = 0;
let lastPinchTime = 0; // MISSING WAS PROX_CAUSE OF BREAK
let aberrationOffset = 0;
let tearOffset = 0;
let tearRand = 0; // New stochastic extra-tear
let lastBurstTime = 0;
let lastAberrationTime = 0;

// GHOST (INK CLOUD) STATE MACHINE
let ghostState = 'IDLE'; // IDLE, BURN, DRIP, FADE
let ghostStartTime = 0;
let ghostPos = [0.0, 0.0];
let ghostVel = [0.0, 0.0]; // Track movement vector
let ghostAlpha = 0;
let ghostId = 0;
let ghostSpread = [1.5, 1.5];
let lastGhostTime = -10.0; // Force immediate start

// Stochastic Fuzz Grain State
let currentGrainScale = 1.0;
let lastGrainShift = 0;

function render(time) {
    time *= 0.001; // convert to seconds
    
    // Resize handling
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = RENDER_W;
        canvas.height = RENDER_H;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }

    // Use values from CRT_CONFIG if available
    const config = window.CRT_CONFIG || { pinch: 0.15, freq: 4, snap: 1.8 };

    // 1. Dual-Mode Burst Logic (1/2 Simple Snap, 1/2 Capacitor Build)
    const bInterval = config.freq || 4.0;
    const bRandomFactor = 0.5; // Jitter intensity
    
    if (!isBuilding && saturation === 0 && (time - lastBurstTime) > (bInterval + Math.random() * bInterval * bRandomFactor)) {
        burstMode = Math.random() > 0.5 ? 1 : 0;
        
        if (burstMode === 0) {
            // BEHAVIOR A: Simple Snap Surge
            saturation = config.snap;
            lastBurstTime = time;
        } else {
            // BEHAVIOR B: Capacitor Build
            isBuilding = true;
        }
    }

    if (isBuilding) {
        // Capacitor charging logic: jittery, non-linear build
        saturation += (0.002 + Math.random() * 0.008); 
        if (Math.random() > 0.9) saturation -= 0.04;
        
        if (saturation > 0.35) {
            saturation = config.snap; 
            isBuilding = false;
            lastBurstTime = time;
        }
    } else if (saturation > 0) {
        // Standard decay for both modes
        saturation *= 0.98;
        if (saturation < 0.005) saturation = 0;
    }

    // Publish saturation to CSS for reactive layout transparency
    document.documentElement.style.setProperty('--crt-saturation', saturation);

    // 2. Periodic Geometry Pinch Spikes
    const pInterval = config['p-interval'] || 4.0;
    const pRandom = config['p-random'] || 0.5;

    if (pinchSpike === 0 && (time - lastPinchTime) > (pInterval + Math.random() * pInterval * pRandom)) {
        pinchSpike = 0.4 * (0.5 + Math.random() * pRandom);
        lastPinchTime = time;
    }

    if (pinchSpike > 0) {
        pinchSpike *= 0.94; // Exponential decay
        if (pinchSpike < 0.001) pinchSpike = 0;
    }

    // 3. COMPRESSION BUFFER STATE MACHINE
    const ghostDensity = config.trails || 0.45;
    const ghostInterval = (1.1 - ghostDensity) * 3.0; // Much more frequent for visibility

    if (ghostState === 'IDLE' && (time - lastGhostTime) > ghostInterval) {
        ghostState = 'BURN';
        ghostStartTime = time;
        ghostId = Math.random() * 1000.0;
        
        // MOVED back to center area for absolute testing
        ghostPos = [0.2 + Math.random() * 0.6, 0.4 + Math.random() * 0.2];
        
        // Random drift speed
        ghostVel = [(Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005];
        
        // HUGE spread factor for testing
        ghostSpread = [0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4];
    }

    if (ghostState === 'BURN') {
        const elapsed = time - ghostStartTime;
        const attack = 0.8; 
        ghostAlpha = Math.min(1.0, elapsed / attack);
        if (elapsed > attack) {
            ghostState = 'DRIP';
            ghostStartTime = time;
        }
    } else if (ghostState === 'DRIP') {
        const elapsed = time - ghostStartTime;
        const dripDuration = 3.0;
        const progress = Math.min(1.0, elapsed / dripDuration);
        
        // Drift away from the corner
        ghostPos[0] += ghostVel[0];
        ghostPos[1] += ghostVel[1];
        
        if (progress >= 1.0 || Math.abs(ghostPos[0] - 0.5) > 0.7 || Math.abs(ghostPos[1] - 0.5) > 0.7) {
            ghostState = 'FADE';
            ghostStartTime = time;
        }
    } else if (ghostState === 'FADE') {
        const elapsed = time - ghostStartTime;
        const release = 0.8;
        ghostAlpha = Math.max(0, 1.0 - (elapsed / release));
        if (ghostAlpha <= 0) {
            ghostState = 'IDLE';
            lastGhostTime = time;
        }
    }

    // 3. Random Aberration Logic
    if (time - lastAberrationTime > 2.0 + Math.random() * 5.0) {
        aberrationOffset = (Math.random() - 0.5) * 0.2;
        lastAberrationTime = time;
        // Sync the mechanical tear to the start of the aberration
        tearOffset = aberrationOffset;
        // Sign-aware stochastic "extra tear" magnitude (up to 15px)
        tearRand = (tearOffset >= 0 ? 1.0 : -1.0) * Math.random() * 15.0;
    } else {
        aberrationOffset *= 0.5; 
        if (Math.abs(aberrationOffset) < 0.001) aberrationOffset = 0;
        
        // Mechanical tear lingers much longer (slow decay 0.99)
        tearOffset *= 0.992;
        if (Math.abs(tearOffset) < 0.0001) {
            tearOffset = 0;
            tearRand = 0;
        }
    }

    // Publish values for layout tearing
    document.documentElement.style.setProperty('--crt-aberration', aberrationOffset);
    document.documentElement.style.setProperty('--crt-tear', tearOffset);
    document.documentElement.style.setProperty('--crt-tear-rand', tearRand);

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeUniformLocation, time);
    gl.uniform1f(saturationUniformLocation, saturation);
    gl.uniform1f(aberrationUniformLocation, aberrationOffset);
    gl.uniform1f(pinchUniformLocation, (config.pinch || 0.15) + pinchSpike);
    // Stochastic Fuzz Randomization
    if (time - lastGrainShift > 4.0 + Math.random() * 4.0) {
        currentGrainScale = 0.5 + Math.random() * 1.5;
        lastGrainShift = time;
    }
    
    gl.uniform1f(noiseUniformLocation, (config.noise || 0.25) * currentGrainScale);
    gl.uniform1f(bleedUniformLocation, config.bleed || 0.2);
    // ghost uniforms
    gl.uniform2f(ghostPosLoc, ghostPos[0], ghostPos[1]);
    gl.uniform1f(ghostAlphaLoc, ghostAlpha);
    gl.uniform1f(ghostStochLoc, (config.stoch !== undefined) ? config.stoch : 0.55);
    gl.uniform1f(ghostCBufferLoc, (config['c-buffer'] !== undefined) ? config['c-buffer'] : 0.15);
    gl.uniform2f(ghostSpreadLoc, ghostSpread[0], ghostSpread[1]);
    gl.uniform1f(ghostIdLoc, ghostId);
    gl.uniform1f(boostContrastLoc, config['boost-contrast'] || 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);

// Hardware Hooks for external plugins (like chat.js)
window.CRT_BURST = () => { saturation = 1.2; };
window.CRT_ABERRATION = () => { aberrationOffset = (Math.random() - 0.5) * 0.3; };
