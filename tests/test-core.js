/**
 * test-core.js - Isomorphic Zero-Dependency Assertion Engine
 * Shared test cases for 'STOCHASTIC_ENCRYPT' across Node/Browser.
 */

const STOCHASTIC_TEST_SUITE = (function () {
  const tests = [];
  const results = [];

  // Static Test Vector from Node (CLI to Browser check)
  const STATIC_VECTOR = {
      plaintext: "INTERRUPT_SIGNAL_77",
      password: "alpha-omega-99",
      blob: "EjrqSpBm6Cz5BtCB/hnul0iR+qxZ2VfR12cvIYkyFD5IUArVE7q9/rNdOyPNvxEl6dJOYGRDLP781lA74uOG"
  };

  function addTest(name, fn) {
    tests.push({ name, fn });
  }

  async function runTests(lib, logFn) {
    for (let test of tests) {
      try {
        await test.fn(lib);
        logFn(`[PASS] ${test.name}`, 'success');
        results.push({ name: test.name, pass: true });
      } catch (err) {
        logFn(`[FAIL] ${test.name}: ${err.message}`, 'error');
        results.push({ name: test.name, pass: false, error: err.message });
      }
    }
    const passed = results.filter(r => r.pass).length;
    logFn(`\n--- TEST_SUMMARY: ${passed}/${tests.length} PASSED ---`, 'info');
  }

  // Define Tests
  addTest('Isomorphic Encryption Loop', async (lib) => {
    const raw = "ZERO_TRUST_SIGNAL_VECTOR_88";
    const pass = "secret-pass-123";
    const blob = await lib.encrypt(raw, pass);
    const decrypted = await lib.decrypt(blob, pass);
    if (raw !== decrypted) throw new Error('Plaintext mismatch');
  });

  addTest('Static Vector Decryption (CLI/Browser Consistency)', async (lib) => {
    const decrypted = await lib.decrypt(STATIC_VECTOR.blob, STATIC_VECTOR.password);
    if (decrypted !== STATIC_VECTOR.plaintext) throw new Error('Vector decryption mismatch');
  });

  addTest('Security: Invalid Password Failure', async (lib) => {
    const blob = await lib.encrypt("SECRET", "CORRECT_PASS");
    try {
      await lib.decrypt(blob, "WRONG_PASS");
      throw new Error('Allowed decryption with invalid password');
    } catch (e) {
      if (e.message.includes('failed')) return; // Pass!
      throw e;
    }
  });

  addTest('Security: Corrupted Blob Detection', async (lib) => {
    const blob = await lib.encrypt("DATA", "PASS");
    const corrupted = blob.slice(0, -5) + 'AAAAA'; // Corrupt the tail
    try {
      await lib.decrypt(corrupted, "PASS");
      throw new Error('Allowed decryption of corrupted payload');
    } catch (e) {
      if (e.message.includes('failed')) return; // Pass!
      throw e;
    }
  });

  return { runTests };
})();

// Node export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = STOCHASTIC_TEST_SUITE;
}
