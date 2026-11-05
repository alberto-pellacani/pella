// Cifratura simmetrica (AES-256-GCM) per i segreti salvati nel database, es. le chiavi API.
// Il risultato è "iv.tag.testoCifrato" in base64: IV casuale a ogni cifratura,
// e il tag GCM fa fallire la decifratura se il dato è stato alterato o la chiave è sbagliata.
const crypto = require('node:crypto');

const KEY_RE = /^[0-9a-fA-F]{64}$/;

function createSecretBox(keyHex) {
  if (!KEY_RE.test(String(keyHex || ''))) throw new Error('Chiave di cifratura non valida: servono 64 caratteri esadecimali');
  const key = Buffer.from(keyHex, 'hex');

  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  }

  function decrypt(payload) {
    const [iv, tag, data] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  return { encrypt, decrypt };
}

module.exports = { createSecretBox, KEY_RE };
