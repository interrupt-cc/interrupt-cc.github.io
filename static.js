/**
 * static.js - CRT Static Background Effect
 * High-performance WebGL noise with glitches and bursts.
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
    uniform float u_glitch_offset;
    uniform float u_pinch_factor;
    uniform float u_noise_floor;
    uniform float u_bleed;
    // ghost uniforms
    uniform vec2 u_ghost_pos;
    uniform float u_ghost_radius;
    uniform float u_ghost_alpha;

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
        
        // Global horizontal glitching
        if (u_glitch_offset > 0.0) {
            float band = step(0.1, random(vec2(floor(uv.y * 15.0), u_time)));
            if (band > 0.5) uv.x += u_glitch_offset;
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

        // 6. SINGLE PHANTOM INK DRIP
        // Highly localized CMYK distortion
        if (u_ghost_alpha > 0.01) {
            // Distort the distance check to feel like a dripping 'blob'
            vec2 ghostDir = uv - u_ghost_pos;
            // Vertical stretch: makes the distance check squashed vertically (elongated visual)
            ghostDir.y *= 0.5; 
            
            float dist = length(ghostDir);
            float ghostMask = smoothstep(u_ghost_radius, u_ghost_radius - 0.02, dist);
            
            if (ghostMask > 0.0) {
                vec2 pUv = floor(uv * 80.0) / 80.0; // Chunky pixels for the bleed
                float hueSeed = random(pUv + 77.0);
                vec3 cmyk;
                if (hueSeed < 0.33) cmyk = vec3(0.0, 1.0, 1.0); 
                else if (hueSeed < 0.66) cmyk = vec3(1.0, 0.0, 1.0); 
                else cmyk = vec3(1.0, 1.0, 0.0); 
                
                float k = random(pUv + 99.0);
                cmyk *= (1.0 - k * 0.2); 
                
                color = mix(color, cmyk, ghostMask * u_bleed * u_ghost_alpha);
            }
        }

        // Saturation burst and standard scanlines
        vec3 finalColor = color + vec3(u_saturation);
        float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.06;
        finalColor -= vec3(scanline);

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
const glitchUniformLocation = gl.getUniformLocation(program, "u_glitch_offset");
const pinchUniformLocation = gl.getUniformLocation(program, "u_pinch_factor");
const noiseUniformLocation = gl.getUniformLocation(program, "u_noise_floor");
const bleedUniformLocation = gl.getUniformLocation(program, "u_bleed");
const ghostPosLoc = gl.getUniformLocation(program, "u_ghost_pos");
const ghostRadiusLoc = gl.getUniformLocation(program, "u_ghost_radius");
const ghostAlphaLoc = gl.getUniformLocation(program, "u_ghost_alpha");

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
let glitchOffset = 0;
let lastBurstTime = 0;
let lastGlitchTime = 0;

// GHOST (INK DRIP) STATE MACHINE
let ghostState = 'IDLE'; // IDLE, BURN, DRIP, FADE
let ghostStartTime = 0;
let ghostPos = [0.5, 0.5];
let ghostRadius = 0;
let ghostAlpha = 0;
let lastGhostTime = 0;

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

    // 3. INK DRIP STATE MACHINE
    const ghostDensity = config.trails || 0.3;
    const ghostInterval = (1.1 - ghostDensity) * 15.0; // inverse density to interval

    if (ghostState === 'IDLE' && (time - lastGhostTime) > ghostInterval) {
        ghostState = 'BURN';
        ghostStartTime = time;
        ghostPos = [0.1 + Math.random() * 0.8, 0.4 + Math.random() * 0.4]; // Start high-ish
    }

    if (ghostState === 'BURN') {
        const elapsed = time - ghostStartTime;
        const attack = 1.0; 
        ghostAlpha = Math.min(1.0, elapsed / attack);
        ghostRadius = ghostAlpha * 0.04; // grow to line size
        if (elapsed > attack) {
            ghostState = 'DRIP';
            ghostStartTime = time;
        }
    } else if (ghostState === 'DRIP') {
        const elapsed = time - ghostStartTime;
        ghostPos[1] -= elapsed * 0.005; // Drip down the page
        if (ghostPos[1] < -0.1 || elapsed > 8.0) {
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

    // 3. Random Glitch Logic
    if (time - lastGlitchTime > 2.0 + Math.random() * 5.0) {
        glitchOffset = (Math.random() - 0.5) * 0.2;
        lastGlitchTime = time;
    } else {
        glitchOffset *= 0.5; 
        if (Math.abs(glitchOffset) < 0.001) glitchOffset = 0;
    }

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeUniformLocation, time);
    gl.uniform1f(saturationUniformLocation, saturation);
    gl.uniform1f(glitchUniformLocation, glitchOffset);
    gl.uniform1f(pinchUniformLocation, (config.pinch || 0.15) + pinchSpike);
    gl.uniform1f(noiseUniformLocation, config.noise || 0.25);
    gl.uniform1f(bleedUniformLocation, config.bleed || 0.2);
    // ghost uniforms
    gl.uniform2f(ghostPosLoc, ghostPos[0], ghostPos[1]);
    gl.uniform1f(ghostRadiusLoc, ghostRadius);
    gl.uniform1f(ghostAlphaLoc, ghostAlpha);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
