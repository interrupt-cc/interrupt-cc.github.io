/**
 * batch-redact.js - Automated PII Redaction
 * Process a template file and replace [[REDACT:...]] markers with encrypted blobs.
 * Usage: node batch-redact.js [template_path] [output_path] [password]
 */

const fs = require('fs');
const STOCHASTIC_ENCRYPT = require('../js/crypt-lib.js');

async function processTemplate() {
    const [templatePath, outputPath, password] = process.argv.slice(2);

    if (!templatePath || !outputPath || !password) {
        console.error('\n[SIGNAL_ERROR]: Missing arguments');
        console.log('Usage: node tools/batch-redact.js manifest/cv-template.html manifest/cv.html <PASSPHRASE>');
        console.log('NOTE: Use a LONG RANDOM passphrase (e.g. `openssl rand -base64 18`).');
        console.log('      The retired "Amp-Freq" strings (e.g. "40-240") are decoy bait now.');
        console.log('      Paste the emitted CARRIER_CODES array into js/cv.js (_CARRIER_CODES),');
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

        // Emit the runtime key assembly for js/cv.js. The passphrase must
        // never appear as greppable text in served source; only this array.
        const codes = [...password].map(c => c.charCodeAt(0));
        console.log('--- PASTE INTO js/cv.js (_CARRIER_CODES) ---');
        console.log(`_CARRIER_CODES: [${codes.join(',')}],`);
        console.log('--------------------------------------------\n');

    } catch (err) {
        console.error(`\n[SIGNAL_ERROR]: ${err.message}\n`);
        process.exit(1);
    }
}

processTemplate();
