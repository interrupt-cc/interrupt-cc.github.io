# INTERRUPT_SIGNAL_TRANSCEIVER // [STOCHASTIC_FEED]

A high-fidelity, reactive hardware simulation and decentralized signal-feed. Built on zero-dependency isomorphic cryptography and procedural WebGL CRT physics.

---

## 01: HARDWARE_SPECS (The CRT Engine)
The UI is built on a dual-canvas WebGL substrate that simulates a malfunctioning industrial CRT monitor.

- **Compression Buffer**: Procedural stochastic pixel clusters (Ink Clouds) that materialize/fade using additive CMYK blending.
- **Red Aperture Grill**: A high-layer foreground canvas (`lines.js`) generating procedural vertical lines with top-anchored power-loss physics and edge-scaling falloff.
- **Hardware-Sync Transparency**: UI frames (`.gutter`, `.window`) react physically to energy bursts via CSS-variable syncing (`--crt-saturation` and `--crt-aberration`).
- **Synchronized Tearing**: The bottom 1/8th of content frames physically tear away during signal spikes, lingering on screen with a slower mechanical slide-back (0.992 decay).

## 02: SIGNAL_DECRYPT (Decentralized Chat)
A real-time, peer-to-peer communication layer implemented via **Gun.js**.

- **Falling Data Rain**: Incoming transmissions are decrypted and physically fall down the screen as digital rain.
- **Event Spiking**: Each incoming signal triggers a hardware aberration/pulse in the WebGL core, providing tactile feedback for world-wide transmissions.
- **[SIGNAL_OUT] Prompt**: A minimalist terminal transceiver at the viewport base for broadcasting.

## 03: STOCHASTIC_ENCRYPT (Security Protocol)
A zero-dependency, isomorphic PII redaction system built on native **SubtleCrypto**.

- **Isomorphic Core**: `crypt-lib.js` works seamlessly in both Node.js (CLI) and modern browsers (Chrome, Firefox, Safari).
- **Zero-Trust Storage**: Sensitive personal data (PII) is stored only as encrypted Base64 blobs in GitHub.
- **Redaction Manifest**: `cv.html` uses "Aberration Redaction" blocks that are un-indexable by standard crawlers until decrypted locally by the user.

### Developer Tools:
- **CLI Encryptor**: `node tools/crypt-cli.js encrypt "[DATA]" "[PASS]"`
- **Batch Redactor**: `node tools/batch-redact.js manifest/cv-template.html manifest/cv.html [PASS]` (Automated build process).
- **Verification Suite**: `node tests/test-cli.js` or `tests/test-browser.html` (Isomorphic testing).

## 04: BUILD_MANIFEST
This project prioritizes **Zero-Trust Supply-Chain Security**. No third-party NPM libraries are used for security or core logic.

```
├── index.html
├── README.md
├── manifest/
│   ├── cv.html          <-- Generated Manifest
│   └── cv-template.html <-- Redaction Template
├── css/
│   └── style.css
├── js/
│   ├── static.js
│   ├── lines.js
│   ├── chat.js
│   ├── crypt-lib.js
│   └── cv.js
├── tools/
│   ├── crypt-cli.js
│   └── batch-redact.js
└── tests/
    ├── test-core.js
    ├── test-cli.js
    └── test-browser.html
```

---

[STOCHASTIC_SYSTEM_OK] // [SIGNAL_CONNECTED]
