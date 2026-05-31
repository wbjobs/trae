import { generateKeyPairSync, createCertificate, createPrivateKey, createPublicKey } from 'crypto'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log('正在生成自签名证书...')

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
})

const certificate = createCertificate({
  key: privateKey,
  cert: publicKey,
  days: 365,
  serial: Math.floor(Math.random() * 100000),
  subject: {
    countryName: 'CN',
    organizationName: 'Screen Recorder',
    commonName: 'localhost'
  },
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: '127.0.0.1' }
      ]
    }
  ]
}, (err, cert) => {
  if (err) {
    console.error('生成证书失败:', err)
    process.exit(1)
  }

  writeFileSync(join(__dirname, 'key.pem'), privateKey)
  writeFileSync(join(__dirname, 'cert.pem'), cert)

  console.log('证书生成完成!')
  console.log('  key.pem')
  console.log('  cert.pem')
  console.log('')
  console.log('注意: 由于是自签名证书，浏览器会提示安全警告。')
  console.log('在 Chrome 中可以访问 chrome://flags/#allow-insecure-localhost 来允许本地开发使用')
})
