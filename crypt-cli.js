/**
 * crypt-cli.js - STOCHASTIC_ENCRYPT Local Redaction Tool
 * CLI utility to encrypt PII before committing to GitHub.
 * Usage: node crypt-cli.js [encrypt|decrypt] [data] [password]
 */

const STOCHASTIC_ENCRYPT = require('./crypt-lib.js');

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0]; // encrypt | decrypt
  const data = args[1];
  const password = args[2];

  if (!mode || !data || !password) {
    console.log('\n[SIGNAL_ERROR]: Insufficient Arguments');
    console.log('Usage: node crypt-cli.js [encrypt|decrypt] [data] [password]\n');
    process.exit(1);
  }

  try {
    if (mode === 'encrypt') {
      const result = await STOCHASTIC_ENCRYPT.encrypt(data, password);
      console.log('\n--- ENCRYPTED_SIGNAL_BLOB ---');
      console.log(result);
      console.log('------------------------------\n');
    } else if (mode === 'decrypt') {
      const result = await STOCHASTIC_ENCRYPT.decrypt(data, password);
      console.log('\n--- DECRYPTED_SIGNAL_DATA ---');
      console.log(result);
      console.log('------------------------------\n');
    } else {
      console.log('[SIGNAL_ERROR]: Invalid mode. Use "encrypt" or "decrypt".');
    }
  } catch (err) {
    console.error(`\n[SIGNAL_ERROR]: ${err.message}\n`);
    process.exit(1);
  }
}

main();
