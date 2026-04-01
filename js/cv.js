/**
 * cv.js - Signal Decryption Logic for the CV_MANIFEST
 * Handles the 'Aberration Reveal' and decryption of PII blobs.
 */

const DecryptManager = {
  init: () => {
    const btn = document.getElementById('decrypt-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const password = prompt('[INPUT_SIGNAL_KEY_REQUIRED]:');
      if (!password) return;

      try {
        await DecryptManager.revealAll(password);
        btn.innerText = 'SIGNAL_DECRYPTED';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'default';
        
        // Final visual burst for the hardware-link aesthetic
        if (window.CRT_BURST) window.CRT_BURST();
        if (window.CRT_ABERRATION) window.CRT_ABERRATION();
        
      } catch (err) {
        console.error('[DECRYPT_ERROR]: ', err.message);
        alert('[SIGNAL_ERROR]: INVALID_KEY_DETECTED');
        if (window.CRT_ABERRATION) window.CRT_ABERRATION();
      }
    });
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
