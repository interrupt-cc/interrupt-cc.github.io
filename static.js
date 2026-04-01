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

    float random(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        
        // Apply occasional glitch offset (horizontal shift)
        if (u_glitch_offset > 0.0) {
            // Only shift specific horizontal bands during a glitch
            float band = step(0.1, random(vec2(floor(uv.y * 10.0), u_time)));
            if (band > 0.5) {
                uv.x += u_glitch_offset;
            }
        }

        // Generate noise
        // Combining spatial and temporal randomness for "boiling" static
        float n = random(uv + fract(u_time * 0.77));
        
        // Occasional horizontal "rolling" interference bands
        float roll = sin(uv.y * 5.0 + u_time * 2.0);
        if (roll > 0.9) {
           n += 0.15;
        }

        // Saturation burst logic
        float finalColor = n + u_saturation;

        // Subtle scanline effect
        float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.05;
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

    // Random Bursts Logic
    if (time - lastBurstTime > 5.0 + Math.random() * 10.0) {
        saturation = 1.0;
        lastBurstTime = time;
    }
    if (saturation > 0) {
        saturation *= 0.92; // Quick fade
        if (saturation < 0.01) saturation = 0;
    }

    // Random Glitch Logic
    if (time - lastGlitchTime > 2.0 + Math.random() * 5.0) {
        glitchOffset = (Math.random() - 0.5) * 0.2;
        lastGlitchTime = time;
    } else {
        glitchOffset *= 0.5; // Snap back quickly
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
