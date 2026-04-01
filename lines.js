/**
 * lines.js - Dynamic Red Aperture Grill Overlay
 * Procedural foreground lines with power-loss and bunching physics.
 */

const lineCanvas = document.getElementById('crt-lines');
const lgl = lineCanvas.getContext('webgl');

if (!lgl) {
    console.error('WebGL not supported for crt-lines');
}

const LINE_W = 640;
const LINE_H = 480;

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

const lvsSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const lfsSource = `
    precision mediump float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_power_center;
    uniform float u_bunching;
    uniform float u_falloff;
    uniform float u_alpha;

    float random(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        
        // 1. Stochastic Bunching Logic
        // We use a coarser grid to define line lanes, then jitter them
        float grid = 80.0; 
        float lane = floor(uv.x * grid);
        
        // Offset varies over time and per lane - increased impact for visibility
        float offset = random(vec2(lane, floor(u_time * 0.1))) * u_bunching;
        float jitteredX = uv.x + offset * 0.15;
        
        // Draw the thin line within the lane - narrowed to 1% for sub-pixel feel
        float linePattern = fract(jitteredX * grid);
        float lineMask = step(0.99, linePattern);
        
        // 2. Power Loss Logic (Distance from dynamic center)
        float distY = abs(uv.y - u_power_center.y);
        
        // Edge scaling: falloff is more aggressive (lines are shorter) at the horizontal edges
        float edgeScale = 1.0 + 4.0 * pow(abs(uv.x - 0.5), 2.0); 
        float effectiveFalloff = (5.0 + u_falloff * 25.0) * edgeScale;
        
        // Falloff makes lines 'shorter' if they are far from the power center
        float power = exp(-distY * effectiveFalloff);
        
        // Horizontal clamping: lines also lose power if too far horizontally from center
        float distX = abs(uv.x - u_power_center.x);
        power *= exp(-distX * 2.0);

        // 3. Final Color (Pure Red with dynamic alpha)
        vec3 color = vec3(1.0, 0.1, 0.0); // Slightly orange-red for phosphor feel
        float finalAlpha = lineMask * power * u_alpha;
        
        // Constant low-level flicker
        finalAlpha *= (0.8 + 0.2 * random(vec2(u_time, 0.0)));

        gl_FragColor = vec4(color, finalAlpha);
    }
`;

const lvs = createShader(lgl, lgl.VERTEX_SHADER, lvsSource);
const lfs = createShader(lgl, lgl.FRAGMENT_SHADER, lfsSource);

const lProgram = lgl.createProgram();
lgl.attachShader(lProgram, lvs);
lgl.attachShader(lProgram, lfs);
lgl.linkProgram(lProgram);

const lPosLoc = lgl.getAttribLocation(lProgram, "a_position");
const lResLoc = lgl.getUniformLocation(lProgram, "u_resolution");
const lTimeLoc = lgl.getUniformLocation(lProgram, "u_time");
const lCenterLoc = lgl.getUniformLocation(lProgram, "u_power_center");
const lBunchLoc = lgl.getUniformLocation(lProgram, "u_bunching");
const lFalloffLoc = lgl.getUniformLocation(lProgram, "u_falloff");
const lAlphaLoc = lgl.getUniformLocation(lProgram, "u_alpha");

const lPosBuffer = lgl.createBuffer();
lgl.bindBuffer(lgl.ARRAY_BUFFER, lPosBuffer);
lgl.bufferData(lgl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), lgl.STATIC_DRAW);

let powerCenter = [0.5, 0.5];
let targetCenter = [0.5, 0.5];

function updateLines(time) {
    time *= 0.001;

    if (lineCanvas.width !== lineCanvas.clientWidth || lineCanvas.height !== lineCanvas.clientHeight) {
        lineCanvas.width = LINE_W;
        lineCanvas.height = LINE_H;
        lgl.viewport(0, 0, lgl.canvas.width, lgl.canvas.height);
    }

    const config = window.CRT_CONFIG || {};
    
    // Animate power center stochastically
    if (Math.random() > 0.98) {
        targetCenter = [Math.random(), Math.random()];
    }
    powerCenter[0] += (targetCenter[0] - powerCenter[0]) * 0.02;
    powerCenter[1] += (targetCenter[1] - powerCenter[1]) * 0.02;

    lgl.clearColor(0, 0, 0, 0);
    lgl.clear(lgl.COLOR_BUFFER_BIT);

    // CRITICAL: Enable Alpha Blending for transparent canvas overlay
    lgl.enable(lgl.BLEND);
    lgl.blendFunc(lgl.SRC_ALPHA, lgl.ONE_MINUS_SRC_ALPHA);

    lgl.useProgram(lProgram);
    lgl.enableVertexAttribArray(lPosLoc);
    lgl.bindBuffer(lgl.ARRAY_BUFFER, lPosBuffer);
    lgl.vertexAttribPointer(lPosLoc, 2, lgl.FLOAT, false, 0, 0);

    lgl.uniform2f(lResLoc, lgl.canvas.width, lgl.canvas.height);
    lgl.uniform1f(lTimeLoc, time);
    lgl.uniform2f(lCenterLoc, powerCenter[0], powerCenter[1]);
    lgl.uniform1f(lBunchLoc, config['g-bunch'] || 0.5);
    lgl.uniform1f(lFalloffLoc, config['g-falloff'] || 0.5);
    lgl.uniform1f(lAlphaLoc, config['g-alpha'] || 0.3);

    lgl.drawArrays(lgl.TRIANGLES, 0, 6);
    requestAnimationFrame(updateLines);
}

requestAnimationFrame(updateLines);
