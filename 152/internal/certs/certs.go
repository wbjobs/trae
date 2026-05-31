package certs

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

type CertificateManager struct {
	certDir string
	caCert  *x509.Certificate
	caKey   *rsa.PrivateKey
}

func New(certDir string) (*CertificateManager, error) {
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create cert directory: %w", err)
	}
	cm := &CertificateManager{certDir: certDir}
	if err := cm.loadOrCreateCA(); err != nil {
		return nil, err
	}
	return cm, nil
}

func (cm *CertificateManager) loadOrCreateCA() error {
	caCertPath := filepath.Join(cm.certDir, "ca.crt")
	caKeyPath := filepath.Join(cm.certDir, "ca.key")

	if _, err := os.Stat(caCertPath); err == nil {
		return cm.loadCA(caCertPath, caKeyPath)
	}
	return cm.createCA(caCertPath, caKeyPath)
}

func (cm *CertificateManager) loadCA(certPath, keyPath string) error {
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return err
	}
	certBlock, _ := pem.Decode(certPEM)
	if certBlock == nil {
		return fmt.Errorf("failed to decode CA certificate PEM")
	}
	cm.caCert, err = x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse CA certificate: %w", err)
	}

	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return err
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return fmt.Errorf("failed to decode CA key PEM")
	}
	cm.caKey, err = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse CA private key: %w", err)
	}
	return nil
}

func (cm *CertificateManager) createCA(certPath, keyPath string) error {
	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return fmt.Errorf("failed to generate CA key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"ZTunnel CA"},
			CommonName:   "ZTunnel Root CA",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("failed to create CA certificate: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		return err
	}

	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return err
	}

	cm.caCert, err = x509.ParseCertificate(derBytes)
	if err != nil {
		return err
	}
	cm.caKey = key
	return nil
}

func (cm *CertificateManager) IssueClientCertificate(commonName, org string) (certPEM []byte, keyPEM []byte, fingerprint string, err error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to generate client key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, "", err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{org},
			CommonName:   commonName,
		},
		NotBefore:   time.Now().Add(-time.Hour),
		NotAfter:    time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, cm.caCert, &key.PublicKey, cm.caKey)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to create client certificate: %w", err)
	}

	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	fingerprint = fingerprintSHA256(derBytes)
	return certPEM, keyPEM, fingerprint, nil
}

func (cm *CertificateManager) IssueServerCertificate(hosts []string) (certPEM []byte, keyPEM []byte, err error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate server key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"ZTunnel Server"},
			CommonName:   "ztunnel-server",
		},
		NotBefore:   time.Now().Add(-time.Hour),
		NotAfter:    time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}

	for _, host := range hosts {
		if ip := net.ParseIP(host); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		} else {
			template.DNSNames = append(template.DNSNames, host)
		}
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, cm.caCert, &key.PublicKey, cm.caKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create server certificate: %w", err)
	}

	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return certPEM, keyPEM, nil
}

func (cm *CertificateManager) GetCACertPEM() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cm.caCert.Raw})
}

func fingerprintSHA256(derBytes []byte) string {
	hash := sha256.Sum256(derBytes)
	fp := ""
	for i, b := range hash {
		if i > 0 {
			fp += ":"
		}
		fp += fmt.Sprintf("%02X", b)
	}
	return fp
}

func VerifyCertificate(caCertPEM, clientCertPEM []byte) (*x509.Certificate, error) {
	caCertBlock, _ := pem.Decode(caCertPEM)
	if caCertBlock == nil {
		return nil, fmt.Errorf("failed to decode CA certificate PEM")
	}
	caCert, err := x509.ParseCertificate(caCertBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CA certificate: %w", err)
	}

	clientCertBlock, _ := pem.Decode(clientCertPEM)
	if clientCertBlock == nil {
		return nil, fmt.Errorf("failed to decode client certificate PEM")
	}
	clientCert, err := x509.ParseCertificate(clientCertBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse client certificate: %w", err)
	}

	roots := x509.NewCertPool()
	roots.AddCert(caCert)

	opts := x509.VerifyOptions{
		Roots:     roots,
		KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	chains, err := clientCert.Verify(opts)
	if err != nil {
		return nil, fmt.Errorf("certificate verification failed: %w", err)
	}
	if len(chains) == 0 {
		return nil, fmt.Errorf("no valid certificate chain found")
	}

	return clientCert, nil
}
