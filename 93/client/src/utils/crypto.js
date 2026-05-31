const EC_CURVE = 'P-256';
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export async function generateECDHKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: EC_CURVE },
    false,
    ['deriveKey']
  );
  return keyPair;
}

export async function exportPublicKey(keyPair) {
  const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(publicKey)));
}

export async function importPublicKey(publicKeyBase64) {
  const keyData = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));
  const publicKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'ECDH', namedCurve: EC_CURVE },
    false,
    []
  );
  return publicKey;
}

export async function deriveSharedSecret(privateKey, peerPublicKey) {
  const sharedSecret = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
  return sharedSecret;
}

export async function encryptChunk(key, plaintext, chunkIndex) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, chunkIndex, true);
  
  const associatedData = new Uint8Array(indexBytes.length + iv.length);
  associatedData.set(indexBytes, 0);
  associatedData.set(iv, indexBytes.length);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData, tagLength: AUTH_TAG_LENGTH * 8 },
    key,
    plaintext
  );
  
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_LENGTH);
  
  return result.buffer;
}

export async function decryptChunk(key, ciphertextWithIv, chunkIndex) {
  const data = new Uint8Array(ciphertextWithIv);
  
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);
  
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, chunkIndex, true);
  
  const associatedData = new Uint8Array(indexBytes.length + iv.length);
  associatedData.set(indexBytes, 0);
  associatedData.set(iv, indexBytes.length);
  
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: associatedData, tagLength: AUTH_TAG_LENGTH * 8 },
      key,
      ciphertext
    );
    return plaintext;
  } catch (error) {
    console.error('解密失败:', error);
    throw error;
  }
}

export function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
