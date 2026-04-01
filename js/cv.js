/**
 * cv.js - Signal Decryption Logic for the CV_MANIFEST
 * Handles the 'Aberration Reveal' and decryption of PII blobs.
 */

const DecryptManager = {
  init: () => {
    const btn = document.getElementById('decrypt-btn');
    const container = document.getElementById('oscilloscope-container');
    const canvas = document.getElementById('osc-canvas');
    if (!btn || !container || !canvas) return;

    btn.addEventListener('click', async () => {
      container.style.display = 'flex';
      // AudioContext requires a user gesture to initialize
      if (window.STOCHASTIC_AUDIO) await window.STOCHASTIC_AUDIO.init();
      
      DecryptManager.startOscilloscope(canvas, container, btn);
    });
  },

  startOscilloscope: (canvas, container, btn) => {
    const ctx = canvas.getContext('2d');
    let width = canvas.width;
    let height = canvas.height;
    
    // Hardware resonance targets
    // Build your CV using password: "40-120"
    const targetAmp = 40; 
    const targetFreq = 120; // Re-mapped to Frequency
    
    let userAmp = 10;
    let userFreq = 50;
    let isDragging = false;
    let animationId;

    const chordFrequencies = [65.41, 77.78, 98.00, 116.54]; // C2 Minor 7th (C-Eb-G-Bb)
    const chordColors = [
        'rgba(255, 0, 204, 0.15)', // Magenta
        'rgba(249, 215, 28, 0.15)',// Yellow
        'rgba(0, 139, 163, 0.2)',  // Dim Cyan
        'rgba(255, 0, 0, 0.1)'     // Dark Red
    ];
    let time = 0;

    // Enable Audio Targets
    if (window.STOCHASTIC_AUDIO) {
        window.STOCHASTIC_AUDIO.activateTarget(targetFreq, 0.3); // Play the target tone faintly
    }

    const draw = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // trails
        ctx.fillRect(0, 0, width, height);
        time += 0.05;
        
        // 1. Draw Fake Chord Waves (STOCHASTIC_AUDIO Background)
        for (let i = 0; i < chordFrequencies.length; i++) {
            ctx.beginPath();
            let chordH = 15; // Low visual amplitude
            let fMult = chordFrequencies[i] * 0.001;
            for(let x = 0; x < width; x++) {
                let y = height/2 + Math.sin(x * fMult + time * (i+1)*0.5) * chordH;
                ctx.lineTo(x, y);
            }
            ctx.strokeStyle = chordColors[i];
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // 2. Draw Target (Red Anomaly)
        ctx.beginPath();
        for(let x = 0; x < width; x++) {
            let y = height/2 + Math.sin(x * targetFreq * 0.001) * targetAmp;
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 3. Draw User (Cyan Sync)
        ctx.beginPath();
        for(let x = 0; x < width; x++) {
            let y = height/2 + Math.sin(x * userFreq * 0.001) * userAmp;
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        animationId = requestAnimationFrame(draw);
    };

    const updateFromMouse = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Map X to Frequency (50-300Hz), Y to Amp (0-100)
        userFreq = Math.floor(50 + (x / rect.width) * 250);
        userAmp = Math.floor(Math.abs(y - rect.height/2) * (100 / (rect.height/2)));

        if (window.STOCHASTIC_AUDIO) {
            // Send amplitude to synth normalized (0.0 to 1.0)
            window.STOCHASTIC_AUDIO.updateUserSync(userFreq, userAmp / 200.0);
        }
    };

    canvas.onmousedown = (e) => { isDragging = true; updateFromMouse(e); };
    canvas.onmousemove = (e) => { if(isDragging) updateFromMouse(e); };
    
    canvas.onmouseup = async () => {
        isDragging = false;
        const attempt = `${Math.floor(userAmp)}-${Math.floor(userFreq)}`;
        
        try {
            await DecryptManager.revealAll(attempt);
            cancelAnimationFrame(animationId);
            container.style.display = 'none';
            btn.innerText = 'SIGNAL_DECRYPTED';
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';
            if (window.CRT_BURST) window.CRT_BURST();
            if (window.STOCHASTIC_AUDIO) window.STOCHASTIC_AUDIO.shutdownAnomaly();
        } catch (err) {
            // Wrong key! The signals didn't match perfectly.
            document.getElementById('osc-status').innerText = 'ERROR: CARRIER WAVE REJECTED';
            document.getElementById('osc-status').style.color = '#ff0000';
            setTimeout(() => {
                document.getElementById('osc-status').innerText = 'STATUS: DE-SYNCED';
                document.getElementById('osc-status').style.color = 'var(--text-color)';
            }, 1000);
            if (window.CRT_ABERRATION) window.CRT_ABERRATION();
            userAmp = 10; userFreq = 50; // Reset
            if (window.STOCHASTIC_AUDIO) window.STOCHASTIC_AUDIO.updateUserSync(50, 0);
        }
    };
    
    draw();
  },

  revealAll: async (password) => {
    const redactedElms = document.querySelectorAll('.redacted');
    
    // Decrypt all blobs
    for (let el of redactedElms) {
      const blob = el.getAttribute('data-blob');
      if (!blob) continue;

      try {
        const decodedText = await STOCHASTIC_ENCRYPT.decrypt(blob, password);
        DecryptManager.aberrationTransition(el, decodedText);
      } catch (e) {
        // Silent fail for individual elements to allow global catch
        throw e;
      }
    }
  },

  aberrationTransition: (el, finalOutput) => {
    // Reveal text with a "scrambling" delay for aesthetic impact
    let iterations = 0;
    const originalText = el.innerText;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    
    const interval = setInterval(() => {
        el.innerText = el.innerText
            .split('')
            .map((char, index) => {
                if(index < iterations) {
                    return finalOutput[index];
                }
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('');

        if(iterations >= finalOutput.length) {
            clearInterval(interval);
            el.innerText = finalOutput;
            el.classList.add('revealed');
        }

        iterations += 1 / 3; // Speed of the reveal
    }, 50);
  }
};

document.addEventListener('DOMContentLoaded', DecryptManager.init);
