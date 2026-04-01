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
        console.log('Usage: node batch-redact.js cv-template.html cv.html my-password\n');
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
        console.log(`\n[SIGNAL_SUCCESS]: MANIFEST_WRITTEN_TO: ${outputPath}\n`);

    } catch (err) {
        console.error(`\n[SIGNAL_ERROR]: ${err.message}\n`);
        process.exit(1);
    }
}

processTemplate();
