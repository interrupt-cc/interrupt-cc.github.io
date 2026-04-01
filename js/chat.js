/**
 * chat.js - STOCHASTIC_DECRYPT Transceiver
 * Decentralized P2P chat logic with falling-signal visuals.
 */

const gun = Gun([
    'https://gun-manhattan.herokuapp.com/gun', 
    'https://gun-us.herokuapp.com/gun',
    'https://liberty-city.herokuapp.com/gun'
]);

const signalBucket = gun.get('interrupt-cc-signal-leak-v1');
const signalInput = document.getElementById('signal-broadcast');
const ANON_ID = 'NODE_0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase();

// 1. RECEIVE SIGNAL
signalBucket.map().once((data, id) => {
    if (!data || !data.msg) return;
    
    // Ignore old data (crude TTL check)
    const now = Date.now();
    if (now - data.time > 1000 * 60 * 60) return; // 1 hour TTL
    
    spawnSignal(`${data.from}: ${data.msg}`);
});

function spawnSignal(text) {
    const div = document.createElement('div');
    div.className = 'falling-signal';
    div.innerText = text;
    
    // Stochastic horizontal placement (10% to 90% width)
    const xPos = 10 + Math.random() * 80;
    div.style.left = xPos + 'vw';
    
    // Varying speeds for that data-rain feel
    const duration = 8 + Math.random() * 6;
    div.style.animationDuration = duration + 's';
    
    document.body.appendChild(div);
    
    // HARDWARE_FEEDBACK: Spike CRT on incoming signal
    if (window.CRT_ABERRATION) window.CRT_ABERRATION();
    if (window.CRT_BURST && Math.random() > 0.7) window.CRT_BURST();
    
    // Lifecycle cleanup
    setTimeout(() => {
        div.remove();
    }, duration * 1000);
}

// 2. BROADCAST SIGNAL
signalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const msg = signalInput.value.trim();
        if (msg) {
            signalBucket.set({
                from: ANON_ID,
                msg: msg,
                time: Date.now()
            });
            signalInput.value = '';
            // Visual confirmation for self
            if (window.CRT_ABERRATION) window.CRT_ABERRATION();
        }
    }
});

console.log(`[DECRYPT_ENGINE_ACTIVE]: REGISTERED AS ${ANON_ID}`);
