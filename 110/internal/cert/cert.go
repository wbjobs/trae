package cert

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"sync"
	"time"
)

type Manager struct {
	caCert    *x509.Certificate
	caKey     *ecdsa.PrivateKey
	certCache sync.Map
}

func NewManager() (*Manager, error) {
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generating CA key: %w", err)
	}

	caTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"HTTP Mirror"},
			CommonName:   "HTTP Mirror CA",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	caCertDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("creating CA certificate: %w", err)
	}

	caCert, err := x509.ParseCertificate(caCertDER)
	if err != nil {
		return nil, fmt.Errorf("parsing CA certificate: %w", err)
	}

	return &Manager{
		caCert: caCert,
		caKey:  caKey,
	}, nil
}

func (m *Manager) GetCertificate(host string) (*tls.Certificate, error) {
	if cached, ok := m.certCache.Load(host); ok {
		return cached.(*tls.Certificate), nil
	}

	certKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generating cert key: %w", err)
	}

	serialNumber, _ := rand.Int(rand.Reader, big.NewInt(1<<62))

	certTemplate := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"HTTP Mirror"},
			CommonName:   host,
		},
		NotBefore:   time.Now().Add(-5 * time.Minute),
		NotAfter:    time.Now().Add(24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}

	if ip := net.ParseIP(host); ip != nil {
		certTemplate.IPAddresses = []net.IP{ip}
	} else {
		certTemplate.DNSNames = []string{host}
	}

	certDER, err := x509.CreateCertificate(rand.Reader, certTemplate, m.caCert, &certKey.PublicKey, m.caKey)
	if err != nil {
		return nil, fmt.Errorf("creating certificate: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: x509.MarshalECPrivateKey(certKey)})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("creating TLS certificate: %w", err)
	}

	m.certCache.Store(host, &tlsCert)

	return &tlsCert, nil
}

func (m *Manager) GetTLSConfig(host string) *tls.Config {
	return &tls.Config{
		GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
			return m.GetCertificate(hello.ServerName)
		},
		InsecureSkipVerify: true,
	}
}

func (m *Manager) CAPEM() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: m.caCert.Raw})
}

func (m *Manager) CAKeyPEM() []byte {
	keyBytes, _ := x509.MarshalECPrivateKey(m.caKey)
	return pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes})
}
