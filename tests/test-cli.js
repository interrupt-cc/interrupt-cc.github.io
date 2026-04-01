/**
 * test-cli.js - STOCHASTIC_TEST Node.js CLI Runner
 * Runs the isomorphic test suite in the terminal.
 */

const STOCHASTIC_ENCRYPT = require('../js/crypt-lib.js');
const STOCHASTIC_TEST_SUITE = require('./test-core.js');

async function runCliTests() {
  console.log('\n[SIGNAL_STOCHASTIC_TEST_INIT]: STARTING CLI SUITE\n');

  await STOCHASTIC_TEST_SUITE.runTests(STOCHASTIC_ENCRYPT, (msg, type) => {
    const color = type === 'success' ? '\x1b[32m' : type === 'error' ? '\x1b[31m' : '\x1b[34m';
    console.log(`${color}${msg}\x1b[0m`);
  });

  console.log('\n[SIGNAL_STOCHASTIC_TEST_COMPLETE]\n');
}

runCliTests();
