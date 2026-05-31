const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '../../certificates');

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const cert = crypto.createCertificateRequest({
  subject: {
    C: 'CN',
    ST: 'Beijing',
    L: 'Beijing',
    O: 'IoT Gateway',
    OU: 'Engineering',
    CN: 'opcua-iot-gateway'
  }
}).selfSign({
  privateKey: privateKey,
  hash: 'sha256',
  days: 3650
});

fs.writeFileSync(path.join(certDir, 'client_key.pem'), privateKey);
fs.writeFileSync(path.join(certDir, 'client_cert.pem'), cert.toString());
fs.writeFileSync(path.join(certDir, 'client_public.pem'), publicKey);

console.log('✅ 证书生成成功:');
console.log(`   - ${path.join(certDir, 'client_key.pem')}`);
console.log(`   - ${path.join(certDir, 'client_cert.pem')}`);
console.log(`   - ${path.join(certDir, 'client_public.pem')}`);
console.log('\n📝 证书有效期: 10年');
