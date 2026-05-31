package remote

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHConnection struct {
	Client *ssh.Client
	Config *SSHConfig
}

type SSHConfig struct {
	Host       string
	Port       int
	Username   string
	AuthMethod string
	Password   string
	KeyFile    string
	Timeout    time.Duration
}

func NewSSHConnection(config SSHConfig) (*SSHConnection, error) {
	if config.Port == 0 {
		config.Port = 22
	}

	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	sshConfig := &ssh.ClientConfig{
		User:            config.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         config.Timeout,
	}

	switch config.AuthMethod {
	case "password":
		if config.Password == "" {
			return nil, fmt.Errorf("password authentication requires a password")
		}
		sshConfig.Auth = []ssh.AuthMethod{
			ssh.Password(config.Password),
		}
	case "key_file":
		keyPath := config.KeyFile
		if keyPath == "" {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("failed to get home directory: %w", err)
			}
			keyPath = filepath.Join(homeDir, ".ssh", "id_rsa")
		}

		keyData, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read SSH key from %s: %w", keyPath, err)
		}

		signer, err := ssh.ParsePrivateKey(keyData)
		if err != nil {
			return nil, fmt.Errorf("failed to parse SSH key: %w", err)
		}

		sshConfig.Auth = []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		}
	default:
		return nil, fmt.Errorf("unsupported authentication method: %s", config.AuthMethod)
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)

	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	return &SSHConnection{
		Client: client,
		Config: &config,
	}, nil
}

func (conn *SSHConnection) Close() error {
	if conn.Client != nil {
		return conn.Client.Close()
	}
	return nil
}

func (conn *SSHConnection) IsConnected() bool {
	return conn.Client != nil && !conn.Client.IsClosed()
}

func (conn *SSHConnection) ExecuteCommand(command string) (string, error) {
	session, err := conn.Client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	if err != nil {
		return string(output), fmt.Errorf("command execution failed: %w", err)
	}

	return string(output), nil
}

func (conn *SSHConnection) TestConnection() error {
	_, err := conn.ExecuteCommand("echo 'connection test'")
	return err
}
