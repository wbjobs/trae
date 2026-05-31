package ssh

import (
	"fmt"
	"io"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
	"ssh-bastion/internal/audit"
	"ssh-bastion/internal/config"
	"ssh-bastion/internal/recorder"
	"ssh-bastion/internal/share"
)

type Session struct {
	Client       *ssh.Client
	Session      *ssh.Session
	StdinPipe    io.WriteCloser
	StdoutPipe   io.Reader
	StderrPipe   io.Reader
	Recorder     *recorder.Recorder
	ShareSession *share.Session
	Extractor    *audit.CommandExtractor
	ServerName   string
	User         string
	SessionID    string
}

func resolveKeyPath(path string) string {
	if len(path) > 0 && path[0] == '~' {
		home, err := os.UserHomeDir()
		if err == nil {
			return home + path[1:]
		}
	}
	return path
}

func parseAuth(auth config.AuthConfig) (ssh.AuthMethod, error) {
	switch auth.Type {
	case "password":
		return ssh.Password(auth.Password), nil
	case "key":
		keyPath := resolveKeyPath(auth.KeyPath)
		key, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, fmt.Errorf("read private key %s: %w", keyPath, err)
		}
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		return ssh.PublicKeys(signer), nil
	default:
		return nil, fmt.Errorf("unsupported auth type: %s", auth.Type)
	}
}

func dialDirect(server *config.ServerConfig) (*ssh.Client, error) {
	auth, err := parseAuth(server.Auth)
	if err != nil {
		return nil, err
	}

	cfg := &ssh.ClientConfig{
		User:            server.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	return ssh.Dial("tcp", addr, cfg)
}

func dialWithJump(server *config.ServerConfig) (*ssh.Client, error) {
	jumpAuth, err := parseAuth(server.JumpAuth)
	if err != nil {
		return nil, fmt.Errorf("jump auth: %w", err)
	}

	jumpCfg := &ssh.ClientConfig{
		User:            server.JumpUser,
		Auth:            []ssh.AuthMethod{jumpAuth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	jumpAddr := fmt.Sprintf("%s:%d", server.JumpHost, server.JumpPort)
	jumpClient, err := ssh.Dial("tcp", jumpAddr, jumpCfg)
	if err != nil {
		return nil, fmt.Errorf("connect jump host: %w", err)
	}

	targetAuth, err := parseAuth(server.Auth)
	if err != nil {
		jumpClient.Close()
		return nil, err
	}

	targetAddr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	conn, err := jumpClient.Dial("tcp", targetAddr)
	if err != nil {
		jumpClient.Close()
		return nil, fmt.Errorf("dial target through jump: %w", err)
	}

	targetCfg := &ssh.ClientConfig{
		User:            server.User,
		Auth:            []ssh.AuthMethod{targetAuth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	ncc, chans, reqs, err := ssh.NewClientConn(conn, targetAddr, targetCfg)
	if err != nil {
		jumpClient.Close()
		return nil, fmt.Errorf("create target connection: %w", err)
	}

	client := ssh.NewClient(ncc, chans, reqs)
	return client, nil
}

func Connect(server *config.ServerConfig) (*Session, error) {
	var client *ssh.Client
	var err error

	if server.JumpHost != "" {
		client, err = dialWithJump(server)
	} else {
		client, err = dialDirect(server)
	}
	if err != nil {
		return nil, err
	}

	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("create session: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := sess.RequestPty("xterm-256color", 40, 120, modes); err != nil {
		sess.Close()
		client.Close()
		return nil, fmt.Errorf("request pty: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := sess.StderrPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := sess.Shell(); err != nil {
		sess.Close()
		client.Close()
		return nil, fmt.Errorf("start shell: %w", err)
	}

	sessionID := fmt.Sprintf("%s-%d", server.Name, time.Now().Unix())

	return &Session{
		Client:     client,
		Session:    sess,
		StdinPipe:  stdin,
		StdoutPipe: stdout,
		StderrPipe: stderr,
		ServerName: server.Name,
		User:       server.User,
		SessionID:  sessionID,
	}, nil
}

func (s *Session) StartRecording(recordDir string) error {
	if s.Recorder != nil {
		return nil
	}
	rec, err := recorder.New(recordDir, s.ServerName)
	if err != nil {
		return err
	}
	s.Recorder = rec
	return nil
}

func (s *Session) StartShare(shareID string) {
	s.ShareSession = share.NewSession(shareID)
}

func (s *Session) StartAudit() {
	auditor := audit.GetAuditor()
	if auditor == nil {
		return
	}

	s.Extractor = audit.NewCommandExtractor(s.SessionID, s.ServerName, s.User, func(cmd string) {
		auditor.Record(s.SessionID, s.ServerName, s.User, cmd)
	})
}

func (s *Session) Write(data []byte) {
	if s.Recorder != nil {
		s.Recorder.Write(data)
	}
	if s.ShareSession != nil {
		s.ShareSession.Broadcast(data)
	}
}

func (s *Session) WriteStdin(data []byte) {
	if s.Extractor != nil {
		s.Extractor.Feed(data)
	}
}

func (s *Session) Resize(cols, rows int) error {
	return s.Session.WindowChange(rows, cols)
}

func (s *Session) Close() {
	if s.Recorder != nil {
		s.Recorder.Close()
	}
	if s.ShareSession != nil {
		s.ShareSession.Close()
	}
	if s.Session != nil {
		s.Session.Close()
	}
	if s.Client != nil {
		s.Client.Close()
	}
}
