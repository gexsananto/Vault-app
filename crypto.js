/*
  crypto.js
  ---------
  Semua enkripsi dilakukan di dalam browser pakai Web Crypto API (SubtleCrypto),
  bukan library pihak ketiga. Tidak ada data yang meninggalkan HP kamu.

  Alur:
  1. Master password -> PBKDF2 (200,000 iterasi, SHA-256) + salt acak -> AES-256 key
  2. Key dipakai buat enkripsi/dekripsi seluruh isi vault (AES-GCM)
  3. Yang disimpan di disk cuma: salt, iv, dan ciphertext (semuanya sudah acak/tidak terbaca)
*/

const PBKDF2_ITERATIONS = 200000;

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveKey(password, saltBytes) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptJSON(key, dataObject) {
  const iv = randomBytes(12);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(dataObject));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  };
}

async function decryptJSON(key, ivBase64, ciphertextBase64) {
  const iv = fromBase64(ivBase64);
  const ciphertext = fromBase64(ciphertextBase64);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintextBuffer));
}

const VaultCrypto = {
  randomSalt: () => toBase64(randomBytes(16)),
  saltFromBase64: fromBase64,
  deriveKey,
  encryptJSON,
  decryptJSON
};
