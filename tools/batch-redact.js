/**
 * batch-redact.js - Automated PII Redaction + Carrier Vault Split
 * Process a template file and replace [[REDACT:...]] markers with encrypted blobs.
 * Usage: node batch-redact.js [template_path] [output_path] [password]
 *
 * Key delivery (v3): the passphrase is split into three tables. Two ship as
 * plain fragments consumed into a WeakMap/gate closure at load; the third
 * ships XOR-masked and is only unmasked inside the live lock handler. The
 * emitter also generates chaff tables (build-time, plus manifest/chaff.js for
 * the runtime pool) so the real material hides in a crowd of lookalikes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const STOCHASTIC_ENCRYPT = require('../js/crypt-lib.js');

const CHAFF_TABLES = 16;      // build-time decoy tables pasted into cv.js
const CHAFF_FILE_TABLES = 48; // decoy tables written to manifest/chaff.js
const MASK_LEN = 16;

const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomCodeTable(minLen, maxLen) {
    // Plausible "key material": alnum-biased printable codes, varied length
    const len = minLen + crypto.randomInt(maxLen - minLen + 1);
    const out = [];
    for (let i = 0; i < len; i++) {
        const roll = crypto.randomInt(100);
        out.push(roll < 85 ? ALNUM.charCodeAt(crypto.randomInt(ALNUM.length)) : 33 + crypto.randomInt(90));
    }
    return out;
}

async function processTemplate() {
    const [templatePath, outputPath, password] = process.argv.slice(2);

    if (!templatePath || !outputPath || !password) {
        console.error('\n[SIGNAL_ERROR]: Missing arguments');
        console.log('Usage: node tools/batch-redact.js manifest/cv-template.html manifest/cv.html <PASSPHRASE>');
        console.log('NOTE: Use a LONG RANDOM passphrase (e.g. `openssl rand -base64 18`).');
        console.log('      The retired "Amp-Freq" strings (e.g. "40-240") are decoy bait now.');
        console.log('      Paste the emitted VAULT block into js/cv.js (__VAULT_TABLES),');
        console.log('      otherwise the rebuilt manifest can never decrypt.\n');
        process.exit(1);
    }

    try {
        let content = fs.readFileSync(templatePath, 'utf8');

        // Match [[REDACT:anything here]]
        const regex = /\[\[REDACT:(.*?)\]\]/g;
        let match;
        const matches = [];

        while ((match = regex.exec(content)) !== null) {
            matches.push(match);
        }

        console.log(`[SIGNAL_BUILD]: FOUND ${matches.length} REDACTION_TARGETS`);

        for (const m of matches) {
            const rawText = m[1];
            const blob = await STOCHASTIC_ENCRYPT.encrypt(rawText, password);
            console.log(`[PASS]: ENCRYPTED_THROUGHPUT: ${rawText.substring(0, 5)}...`);

            // Replace with the HTML structure the site expects
            const redactedHtml = `<span class="redacted" data-blob="${blob}">████████</span>`;
            content = content.replace(m[0], redactedHtml);
        }

        fs.writeFileSync(outputPath, content);
        console.log(`\n[SIGNAL_SUCCESS]: MANIFEST_WRITTEN_TO: ${outputPath}`);

        // --- Carrier vault split -------------------------------------------------
        // The passphrase never appears whole in served source. Split it three
        // ways; mask the tail shard; surround with chaff of the same shape.
        const codes = [...password].map(c => c.charCodeAt(0));
        if (codes.length < 12) {
            console.error('[SIGNAL_ERROR]: Passphrase too short to shard (min 12 chars)');
            process.exit(1);
        }
        const cutA = 8 + crypto.randomInt(Math.floor(codes.length / 3));
        const cutB = cutA + 6 + crypto.randomInt(Math.floor(codes.length / 3));
        const rA = codes.slice(0, cutA);
        const rB = codes.slice(cutA, cutB);
        const rCPlain = codes.slice(cutB);

        const mask = Array.from(crypto.randomBytes(MASK_LEN));
        const rC = rCPlain.map((b, i) => b ^ mask[i % MASK_LEN]);

        const chaff = {};
        const names = [];
        while (names.length < CHAFF_TABLES) {
            const nm = 'x' + crypto.randomInt(10, 99);
            if (!names.includes(nm)) names.push(nm);
        }
        for (const nm of names) chaff[nm] = randomCodeTable(14, 34);

        // Emit paste block for js/cv.js. Neutral table names throughout: the
        // source gives no hint which three tables are load-bearing.
        const tables = { rA, rB, rC, ...chaff };
        console.log('--- PASTE INTO js/cv.js (__VAULT_TABLES / __VAULT_MASK) ---');
        console.log(`__VAULT_TABLES: ${JSON.stringify(tables)},`);
        console.log(`__VAULT_MASK: [${mask.join(',')}],`);
        console.log('------------------------------------------------------------\n');

        // --- Runtime chaff bundle (manifest/chaff.js) -----------------------------
        // Served static, fetched by the gate at open. Reads like leaked vault
        // material; decrypts nothing. Never evaluated - the gate regex-scrapes
        // the tables into its in-memory chaff pool.
        const fileTables = {};
        for (let i = 0; i < CHAFF_FILE_TABLES; i++) fileTables['s' + crypto.randomInt(100, 999)] = randomCodeTable(14, 34);
        const chaffJs = `/**
 * chaff.js - SIGNAL_ARCHIVE // RECOVERY TABLES
 * [SIG-INT] Legacy vault handles retained for operator drift analysis.
 * Do not commit to public mirrors. Tables are checksummed at boot.
 */
(function (root) {
  const TABLES = ${JSON.stringify(fileTables)};
  const checksums = Object.keys(TABLES).reduce((a, k) => {
    a[k] = TABLES[k].reduce((x, v) => (x * 31 + v) & 0xffff, 7);
    return a;
  }, {});
  const RELAY_HANDSHAKE = (handle) => checksums[handle] || null;
  const VAULT_PEEK = (handle) => TABLES[handle] || null;
  root.SIGNAL_ARCHIVE = { TABLES, checksums, RELAY_HANDSHAKE, VAULT_PEEK };
})(typeof self !== 'undefined' ? self : this);
`;
        const chaffPath = path.join(path.dirname(outputPath), 'chaff.js');
        fs.writeFileSync(chaffPath, chaffJs);
        console.log(`[SIGNAL_SUCCESS]: CHAFF_ARCHIVE_WRITTEN_TO: ${chaffPath}`);

    } catch (err) {
        console.error(`\n[SIGNAL_ERROR]: ${err.message}\n`);
        process.exit(1);
    }
}

processTemplate();
