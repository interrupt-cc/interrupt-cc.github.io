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

        // Saturation burst and standard scanlines
        float finalColor = n + u_saturation;
        float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.06;
        finalColor -= scanline;

        gl_FragColor = vec4(vec3(finalColor), 1.0);
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
let nextPinchTime = 0;
let glitchOffset = 0;
let lastBurstTime = 0;
let lastGlitchTime = 0;

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
    const burstFreq = config.freq || 4.0;
    const nextBurstThreshold = burstFreq + (Math.random() * burstFreq * 0.5);
    
    if (!isBuilding && saturation === 0 && time - lastBurstTime > nextBurstThreshold) {
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
        // Capacitor charging logic
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
    const pInterval = config['p-interval'] || 5.0;
    const pRandom = config['p-random'] || 0.5;

    if (time > nextPinchTime) {
        pinchSpike = 0.4 * (0.5 + Math.random() * pRandom);
        const scatter = (Math.random() - 0.5) * 2.0 * pRandom;
        nextPinchTime = time + pInterval * (1.0 + scatter);
    }

    if (pinchSpike > 0) {
        pinchSpike *= 0.94; // Decay
        if (pinchSpike < 0.001) pinchSpike = 0;
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
