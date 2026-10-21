/**
 * test-vault.js - Carrier Vault Integrity Test
 * Verifies the shipped key-split in js/cv.js actually decrypts the shipped
 * manifest blobs in manifest/cv.html - without the passphrase appearing
 * anywhere in this file. If batch-redact was rerun and the emitted vault
 * block was not pasted into cv.js, this test fails.
 *
 * Run: node tests/test-vault.js
 */

const fs = require('fs');
const path = require('path');
const STOCHASTIC_ENCRYPT = require('../js/crypt-lib.js');

const ROOT = path.join(__dirname, '..');

function fail(msg) {
    console.error(`\x1b[31m[FAIL] ${msg}\x1b[0m`);
    process.exit(1);
}

async function main() {
    // 1. Regression guards on the served source surface
    const cv = fs.readFileSync(path.join(ROOT, 'js/cv.js'), 'utf8');
    if (cv.includes('_CARRIER_CODES')) fail('burned table name _CARRIER_CODES is back in cv.js');
    if (/revealAll\s*:\s*async\s*\(\s*\w+\s*\)/.test(cv)) fail('revealAll accepts an argument again');
    if (!/const __VAULT_TABLES = \{"rA"/.test(cv)) fail('vault tables block missing from cv.js');
    // The unlock must end at the WebCrypto boundary, not at a password-taking
    // global: no passphrase string may be materialized and handed to any
    // decrypt call. Hooking a global must yield a CryptoKey, never a string.
    if (/String\.fromCharCode\(\.\.\.key\)/.test(cv)) fail('unlock materializes the passphrase string again');
    if (/STOCHASTIC_ENCRYPT\.decrypt\((?![^)]*['"]40-240['"])/.test(cv)) {
        const calls = cv.match(/STOCHASTIC_ENCRYPT\.decrypt\([^)]*\)/g) || [];
        for (const call of calls) {
            if (!/['"]40-240['"]/.test(call)) fail(`non-decoy decrypt via global found: ${call.trim()}`);
        }
    }
    if (!/\.importKey\('raw', material/.test(cv)) fail('unlock must import raw key material in-closure');
    if (!/decryptManifest/.test(cv)) fail('private manifest decrypt loop missing');

    // 2. Chaff archive exists and carries a real crowd of tables
    const chaffPath = path.join(ROOT, 'manifest/chaff.js');
    if (!fs.existsSync(chaffPath)) fail('manifest/chaff.js missing');
    const chaffText = fs.readFileSync(chaffPath, 'utf8');
    const chaffTables = chaffText.match(/\[(\d{1,3}(?:,\d{1,3}){8,})\]/g) || [];
    if (chaffTables.length < 30) fail(`chaff.js carries only ${chaffTables.length} tables`);

    // 3. Assemble exactly the way the live lock handler does
    const T = JSON.parse(cv.match(/const __VAULT_TABLES = (\{.*?\});/s)[1]);
    const M = JSON.parse(cv.match(/const __VAULT_MASK = (\[.*?\]);/)[1]);
    if (!Array.isArray(M) || M.length !== 16) fail('vault mask malformed');
    const chaffNames = Object.keys(T).filter(k => /^x\d+$/.test(k));
    if (chaffNames.length < 10) fail('build-time chaff crowd too thin');
    const c = T.rC.map((b, i) => b ^ M[i % M.length]);
    const passphrase = String.fromCharCode(...T.rA, ...T.rB, ...c);

    // 4. End to end: the assembled key must open the shipped manifest
    const html = fs.readFileSync(path.join(ROOT, 'manifest/cv.html'), 'utf8');
    const blob = html.match(/class="redacted" data-blob="([^"]+)"/);
    if (!blob) fail('no redacted blob found in manifest/cv.html');
    let plaintext;
    try {
        plaintext = await STOCHASTIC_ENCRYPT.decrypt(blob[1], passphrase);
    } catch (e) {
        fail('assembled vault key does not decrypt the shipped manifest (stale vault block?)');
    }
    if (!plaintext || !plaintext.length) fail('manifest decrypted to empty plaintext');

    // 5. The bait must still open for the legacy carrier, and chaff must not
    const decoyBlob = html.match(/class="redacted decoy" data-blob="([^"]+)"/);
    if (!decoyBlob) fail('decoy feeder blob missing from manifest/cv.html');
    const taunt = await STOCHASTIC_ENCRYPT.decrypt(decoyBlob[1], '40-240');
    if (!/DECOY:\/\//.test(taunt)) fail('legacy carrier no longer opens the feeder artifact');
    for (const name of chaffNames) {
        const guess = String.fromCharCode(...T[name]);
        let opened = false;
        try { await STOCHASTIC_ENCRYPT.decrypt(blob[1], guess); opened = true; } catch (e) {}
        if (opened) fail(`chaff table ${name} unexpectedly decrypts the manifest`);
    }

    console.log('\x1b[32m[PASS] vault assembles, manifest opens, bait opens, chaff is dead ends\x1b[0m');
}

main().catch(e => fail(e.message));
