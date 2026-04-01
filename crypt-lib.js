/**
 * crypt-lib.js - Zero-Dependency Isomorphic WebCrypto Interface
 * Supports Chrome, Firefox, Safari (Browser) and Node.js (16+)
 */

const STOCHASTIC_ENCRYPT = (function () {
  // Normalize Crypto between Browser and Node
  const getSubtle = () => {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
      return globalThis.crypto.subtle;
    }
    try {
      // Node.js support
      return require('node:crypto').webcrypto.subtle;
    } catch (e) {
      throw new Error('WebCrypto not supported in this environment');
    }
  };

  const getCrypto = () => {
    if (typeof globalThis.crypto !== 'undefined') return globalThis.crypto;
    return require('node:crypto').webcrypto;
  };

  const ITERATIONS = 100000;
  const SALT_LEN = 16;
  const IV_LEN = 12;

  // Helpers for Type Conversions
  const strToBuf = (str) => new TextEncoder().encode(str);
  const bufToStr = (buf) => new TextDecoder().decode(buf);
  const bufToBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const base64ToBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /**
   * Derives a 256-bit AES key from a password using PBKDF2
   */
  async function deriveKey(password, salt) {
    const subtle = getSubtle();
    const baseKey = await subtle.importKey(
      'raw',
      strToBuf(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  return {
    /**
     * Encrypts plaintext using a password
     * Returns: salt:iv:ciphertext as a single Base64 string
     */
    encrypt: async function (plaintext, password) {
      const subtle = getSubtle();
      const crypto = getCrypto();
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
      const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
      const key = await deriveKey(password, salt);

      const encrypted = await subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        strToBuf(plaintext)
      );

      // Package it: Salt + IV + Data
      const combined = new Uint8Array(SALT_LEN + IV_LEN + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, SALT_LEN);
      combined.set(new Uint8Array(encrypted), SALT_LEN + IV_LEN);

      return bufToBase64(combined);
    },

    /**
     * Decrypts a Base64 string (salt:iv:ciphertext) using a password
     */
    decrypt: async function (ciphertextB64, password) {
      const subtle = getSubtle();
      const combined = base64ToBuf(ciphertextB64);
      const salt = combined.slice(0, SALT_LEN);
      const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
      const data = combined.slice(SALT_LEN + IV_LEN);

      const key = await deriveKey(password, salt);

      try {
        const decrypted = await subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          data
        );
        return bufToStr(decrypted);
      } catch (e) {
        throw new Error('Decryption failed (Likely invalid key)');
      }
    },
  };
})();

// Export for Node.js if present
if (typeof module !== 'undefined' && module.exports) {
  module.exports = STOCHASTIC_ENCRYPT;
}
