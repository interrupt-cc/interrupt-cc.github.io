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
    // Build your CV using password: "40-240"
    const targetAmp = 40; 
    const targetFreq = 240; // Re-mapped to Frequency
    
    let userAmp = 10;
    let userFreq = 480; // Starts 1 octave ABOVE target
    let isDragging = false;
    let animationId;

    const chordFrequencies = [261.63, 311.13, 392.00, 466.16]; // C4 Minor 7th
    const chordColors = [
        'rgba(255, 0, 204, 0.15)', // Magenta
        'rgba(249, 215, 28, 0.15)',// Yellow
        'rgba(0, 139, 163, 0.2)',  // Dim Cyan
        'rgba(255, 0, 0, 0.1)'     // Dark Red
    ];
    let time = 0;

    // We do NOT activate targets or volume yet. The canvas is a "Touch Synthesizer"

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
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        // Map X to Frequency (50-450Hz), Y to Amp (0-100)
        userFreq = Math.floor(50 + (x / rect.width) * 400);
        userAmp = Math.floor(Math.abs(y - rect.height/2) * (100 / (rect.height/2)));

        if (window.STOCHASTIC_AUDIO) {
            // Send amplitude to synth normalized (0.0 to 1.0)
            window.STOCHASTIC_AUDIO.updateUserSync(userFreq, userAmp / 200.0);
        }
    };

    const startInteraction = (e) => {
        isDragging = true; 
        if (window.STOCHASTIC_AUDIO) {
            window.STOCHASTIC_AUDIO.setChordVolume(1.0); // Fade in background chord
            window.STOCHASTIC_AUDIO.activateTarget(targetFreq, 0.15); // Reveal target frequency cleanly
        }
        updateFromMouse(e);
    };

    canvas.onmousedown = startInteraction;
    canvas.onmousemove = (e) => { if(isDragging) updateFromMouse(e); };
    
    canvas.ontouchstart = startInteraction;
    canvas.ontouchmove = (e) => { 
        if(isDragging) {
            e.preventDefault(); // Prevent vertical scrolling while hacking the signal
            updateFromMouse(e); 
        }
    };
    
    const handleInteractionEnd = async () => {
        isDragging = false;
        
        // --- MOBILE FORGIVENESS HACK (FUZZY DECRYPTION) ---
        // AES-GCM requires an exact string match (e.g. "40-240"). 
        // Small touch screens make pixel-perfect alignment difficult.
        // We brute-force a radius around the user's drop point.
        const rAmp = window.innerWidth < 600 ? 5 : 2;  // +/- 5 amplitude on mobile
        const rFreq = window.innerWidth < 600 ? 10 : 3; // +/- 10 Hz on mobile
        
        let success = false;
        let uA = Math.floor(userAmp);
        let uF = Math.floor(userFreq);

        for (let a = uA - rAmp; a <= uA + rAmp; a++) {
            for (let f = uF - rFreq; f <= uF + rFreq; f++) {
                const attempt = `${a}-${f}`;
                try {
                    await DecryptManager.revealAll(attempt);
                    success = true;
                    break;
                } catch(e) { 
                    // Expected OperationError for wrong keys, continue brute force
                }
            }
            if (success) break;
        }
        
        if (success) {
            cancelAnimationFrame(animationId);
            container.style.display = 'none';
            btn.innerText = 'SIGNAL_DECRYPTED';
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';
            if (window.CRT_BURST) window.CRT_BURST();
            if (window.STOCHASTIC_AUDIO) window.STOCHASTIC_AUDIO.shutdownAnomaly();
        } else {
            // Wrong key radius! The signals didn't match closely enough.
            document.getElementById('osc-status').innerText = 'ERROR: CARRIER WAVE REJECTED';
            document.getElementById('osc-status').style.color = '#ff0000';
            setTimeout(() => {
                document.getElementById('osc-status').innerText = 'STATUS: DE-SYNCED';
                document.getElementById('osc-status').style.color = 'var(--text-color)';
            }, 1000);
            if (window.CRT_ABERRATION) window.CRT_ABERRATION();
            userAmp = 10; userFreq = 480; // Reset to 1 octave above
            if (window.STOCHASTIC_AUDIO) {
                window.STOCHASTIC_AUDIO.updateUserSync(480, 0);
                window.STOCHASTIC_AUDIO.activateTarget(targetFreq, 0.0); // Silence Target
                window.STOCHASTIC_AUDIO.setChordVolume(0.0); // Silence Chord
            }
        }
    };

    canvas.onmouseup = handleInteractionEnd;
    canvas.ontouchend = handleInteractionEnd;
    
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
