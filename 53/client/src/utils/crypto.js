const SHARED_SECRET = 'my-secret-key-2024';

export function xorEncryptDecrypt(input, key = SHARED_SECRET) {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  let output = '';
  for (let i = 0; i < inputStr.length; i++) {
    const charCode = inputStr.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  return output;
}

export function encryptData(data) {
  return btoa(xorEncryptDecrypt(data));
}

export function decryptData(encryptedStr) {
  try {
    const decrypted = xorEncryptDecrypt(atob(encryptedStr));
    return JSON.parse(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return null;
  }
}
