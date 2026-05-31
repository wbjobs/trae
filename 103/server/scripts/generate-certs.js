import forge from 'node-forge'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '../certs')

if (!existsSync(certDir)) {
  mkdirSync(certDir, { recursive: true })
}

const keyPair = forge.pki.rsa.generateKeyPair(2048)

const cert = forge.pki.createCertificate()
cert.publicKey = keyPair.publicKey
cert.serialNumber = '01'
cert.validity.notBefore = new Date()
cert.validity.notAfter = new Date()
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

const attrs = [
  { name: 'commonName', value: '127.0.0.1' },
  { name: 'countryName', value: 'US' },
  { name: 'organizationName', value: 'WebTransport Video Call' }
]

cert.setSubject(attrs)
cert.setIssuer(attrs)

cert.setExtensions([
  { name: 'basicConstraints', cA: true },
  {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true
  },
  {
    name: 'subjectAltName',
    altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' }
    ]
  }
])

cert.sign(keyPair.privateKey)

const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey)
const certPem = forge.pki.certificateToPem(cert)

const keyPath = path.join(certDir, 'server.key')
const certPath = path.join(certDir, 'server.crt')

writeFileSync(keyPath, privateKeyPem)
writeFileSync(certPath, certPem)

console.log('[Certs] Self-signed certificates generated successfully:')
console.log(`  Key: ${keyPath}`)
console.log(`  Cert: ${certPath}`)
console.log(`  Valid until: ${cert.validity.notAfter.toISOString()}`)
console.log('[Certs] Note: For production, use proper certificates from a trusted CA')
