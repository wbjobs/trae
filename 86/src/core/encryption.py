from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import hashlib
import json
from typing import Dict, Any, Optional


class EncryptionManager:
    _instance = None
    SALT_SIZE = 16
    KEY_SIZE = 32
    ITERATIONS = 100000

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        return PBKDF2(password, salt, dkLen=self.KEY_SIZE, count=self.ITERATIONS)

    def encrypt_data(self, data: Dict[str, Any], password: str) -> bytes:
        json_data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        salt = get_random_bytes(self.SALT_SIZE)
        key = self._derive_key(password, salt)
        iv = get_random_bytes(AES.block_size)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        encrypted_data = cipher.encrypt(pad(json_data, AES.block_size))
        return salt + iv + encrypted_data

    def decrypt_data(self, encrypted_bytes: bytes, password: str) -> Optional[Dict[str, Any]]:
        try:
            salt = encrypted_bytes[:self.SALT_SIZE]
            iv = encrypted_bytes[self.SALT_SIZE:self.SALT_SIZE + AES.block_size]
            encrypted_data = encrypted_bytes[self.SALT_SIZE + AES.block_size:]
            key = self._derive_key(password, salt)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted_data = unpad(cipher.decrypt(encrypted_data), AES.block_size)
            return json.loads(decrypted_data.decode('utf-8'))
        except Exception as e:
            print(f"Decrypt error: {e}")
            return None

    def hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode('utf-8')).hexdigest()

    def verify_password(self, password: str, hashed: str) -> bool:
        return self.hash_password(password) == hashed

    def encrypt_file(self, file_path: str, data: Dict[str, Any], password: str):
        encrypted_bytes = self.encrypt_data(data, password)
        with open(file_path, 'wb') as f:
            f.write(encrypted_bytes)

    def decrypt_file(self, file_path: str, password: str) -> Optional[Dict[str, Any]]:
        with open(file_path, 'rb') as f:
            encrypted_bytes = f.read()
        return self.decrypt_data(encrypted_bytes, password)
