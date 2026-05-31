package sshproxy

import (
	"context"
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
	"ssh-bastion-audit/internal/alerting"
	"ssh-bastion-audit/internal/bufferpool"
	"ssh-bastion-audit/internal/config"
	"ssh-bastion-audit/internal/database"
	"ssh-bastion-audit/internal/ha"
	"ssh-bastion-audit/internal/recording"
)

type SSHServer struct {
	cfg                *config.SSHConfig
	hostSigner         ssh.Signer
	sessionRepo        *database.SessionRepository
	ttyFrameRepo       *database.TTYFrameRepository
	screenshotRepo     *database.ScreenshotRepository
	alertRepo          *database.AlertRepository
	recorder           *recording.SessionRecorder
	alerter            *alerting.Alerter
	haManager          *ha.HAManager
	activeSessions     map[uuid.UUID]*ProxySession
	activeSessionsMu   sync.RWMutex
	stateSyncTicker    *time.Ticker
}

type ProxySession struct {
	ID              uuid.UUID
	Username        string
	SrcIP           string
	DstHost         string
	DstPort         int
	ClientConn      ssh.Conn
	ClientChannel   ssh.Channel
	ServerConn      *ssh.Client
	ServerChannel   ssh.Channel
	ServerRequests  <-chan *ssh.Request
	StartTime       time.Time
	BytesWritten    int64
	BytesRead       int64
	TerminalBuffer  []byte
	CurrentCommand  string
	PTYCols         int
	PTYRows         int
	recorder        *recording.SessionRecorder
	alerter         *alerting.Alerter
	sessionRepo     *database.SessionRepository
	alertRepo       *database.AlertRepository
	ttyFrameRepo    *database.TTYFrameRepository
	screenshotRepo  *database.ScreenshotRepository
	frameBatch      *frameBatch
	ctx             context.Context
	cancel          context.CancelFunc
	done            chan struct{}
}

func NewSSHServer(
	cfg *config.SSHConfig,
	hostSigner ssh.Signer,
	sessionRepo *database.SessionRepository,
	ttyFrameRepo *database.TTYFrameRepository,
	screenshotRepo *database.ScreenshotRepository,
	alertRepo *database.AlertRepository,
	recorder *recording.SessionRecorder,
	alerter *alerting.Alerter,
	haManager *ha.HAManager,
) *SSHServer {
	server := &SSHServer{
		cfg:            cfg,
		hostSigner:     hostSigner,
		sessionRepo:    sessionRepo,
		ttyFrameRepo:   ttyFrameRepo,
		screenshotRepo: screenshotRepo,
		alertRepo:      alertRepo,
		recorder:       recorder,
		alerter:        alerter,
		haManager:      haManager,
		activeSessions: make(map[uuid.UUID]*ProxySession),
	}

	if haManager != nil {
		haManager.SetSessionProvider(server)
		haManager.SetRestoreHandler(server.RestoreSession)
	}

	return server
}

func (s *SSHServer) Start(ctx context.Context) error {
	sshConfig := &ssh.ServerConfig{
		PublicKeyCallback: s.publicKeyAuth,
		PasswordCallback:  s.passwordAuth,
		ServerVersion:     "SSH-2.0-BastionAudit-1.0",
	}
	sshConfig.AddHostKey(s.hostSigner)

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", s.cfg.SSHPort))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", s.cfg.SSHPort, err)
	}
	defer listener.Close()

	logrus.Infof("SSH proxy server listening on port %d", s.cfg.SSHPort)

	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			logrus.Errorf("Failed to accept connection: %v", err)
			continue
		}

		go s.handleConnection(ctx, conn)
	}
}

func (s *SSHServer) handleConnection(ctx context.Context, conn net.Conn) {
	defer conn.Close()

	srcIP, _, _ := net.SplitHostPort(conn.RemoteAddr().String())

	sshConn, chans, reqs, err := ssh.NewServerConn(conn, &ssh.ServerConfig{
		PublicKeyCallback: s.publicKeyAuth,
		PasswordCallback:  s.passwordAuth,
		ServerVersion:     "SSH-2.0-BastionAudit-1.0",
	})
	if err != nil {
		logrus.Errorf("SSH handshake failed from %s: %v", srcIP, err)
		return
	}
	defer sshConn.Close()

	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "only session channels are supported")
			continue
		}

		go s.handleSessionChannel(ctx, sshConn, newChannel, srcIP)
	}
}

func (s *SSHServer) handleSessionChannel(ctx context.Context, sshConn *ssh.ServerConn, newChannel ssh.NewChannel, srcIP string) {
	clientChannel, clientRequests, err := newChannel.Accept()
	if err != nil {
		logrus.Errorf("Failed to accept channel: %v", err)
		return
	}
	defer clientChannel.Close()

	dstHost := sshConn.Permissions.Extensions["dst_host"]
	dstPort := 22
	if portStr, ok := sshConn.Permissions.Extensions["dst_port"]; ok {
		fmt.Sscanf(portStr, "%d", &dstPort)
	}

	targetUsername := sshConn.User()

	session := &ProxySession{
		ID:             uuid.New(),
		Username:       targetUsername,
		SrcIP:          srcIP,
		DstHost:        dstHost,
		DstPort:        dstPort,
		ClientConn:     sshConn.Conn,
		ClientChannel:  clientChannel,
		StartTime:      time.Now(),
		TerminalBuffer: make([]byte, 0, 4096),
		recorder:       s.recorder,
		alerter:        s.alerter,
		sessionRepo:    s.sessionRepo,
		alertRepo:      s.alertRepo,
		ttyFrameRepo:   s.ttyFrameRepo,
		screenshotRepo: s.screenshotRepo,
		done:           make(chan struct{}),
	}
	session.ctx, session.cancel = context.WithCancel(ctx)

	s.addActiveSession(session)
	defer s.removeActiveSession(session.ID)

	dbSession := &database.Session{
		Username: session.Username,
		SrcIP:    session.SrcIP,
		DstHost:  session.DstHost,
		DstPort:  session.DstPort,
	}
	if err := s.sessionRepo.Create(ctx, dbSession); err != nil {
		logrus.Errorf("Failed to create session record: %v", err)
		return
	}
	session.ID = dbSession.ID

	if err := session.connectToTarget(sshConn); err != nil {
		logrus.Errorf("Failed to connect to target: %v", err)
		return
	}
	defer session.ServerConn.Close()
	defer session.ServerChannel.Close()

	if s.haManager != nil && s.haManager.IsEnabled() {
		state, _ := s.GetSessionState(session.ID)
		if state != nil {
			s.haManager.SyncSessionNow(state)
		}
	}
	defer func() {
		if s.haManager != nil && s.haManager.IsEnabled() {
			s.haManager.RemoveSession(session.ID)
		}
	}()

	go s.handleClientRequests(clientRequests, session)

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		session.forwardClientToServer()
	}()

	go func() {
		defer wg.Done()
		session.forwardServerToClient()
	}()

	wg.Wait()

	sessionStatus := "completed"
	if ctx.Err() != nil {
		sessionStatus = "terminated"
	}

	if err := s.sessionRepo.EndSession(ctx, session.ID, sessionStatus, session.BytesWritten, session.BytesRead); err != nil {
		logrus.Errorf("Failed to end session: %v", err)
	}

	s.recorder.FinalizeSession(session.ID)
}

func (s *SSHServer) handleClientRequests(reqs <-chan *ssh.Request, session *ProxySession) {
	for req := range reqs {
		switch req.Type {
		case "pty-req":
			if len(req.Payload) >= 4 {
				termLen := binary.BigEndian.Uint32(req.Payload[:4])
				if len(req.Payload) >= int(4+termLen+16) {
					cols := binary.BigEndian.Uint32(req.Payload[4+termLen:])
					rows := binary.BigEndian.Uint32(req.Payload[4+termLen+4:])
					session.PTYCols = int(cols)
					session.PTYRows = int(rows)
					session.recorder.RecordPTY(session.ID, int(cols), int(rows))
				}
			}
			req.Reply(true, nil)

			if session.ServerChannel != nil {
				_, err := session.ServerChannel.SendRequest(req.Type, req.WantReply, req.Payload)
				if err != nil {
					logrus.Errorf("Failed to forward pty-req: %v", err)
				}
			}

		case "shell", "exec":
			req.Reply(true, nil)
			if session.ServerChannel != nil {
				_, err := session.ServerChannel.SendRequest(req.Type, req.WantReply, req.Payload)
				if err != nil {
					logrus.Errorf("Failed to forward %s: %v", req.Type, err)
				}
			}

		case "window-change":
			req.Reply(true, nil)
			if session.ServerChannel != nil {
				_, err := session.ServerChannel.SendRequest(req.Type, req.WantReply, req.Payload)
				if err != nil {
					logrus.Errorf("Failed to forward window-change: %v", err)
				}
			}

		default:
			req.Reply(false, nil)
		}
	}
}

func (s *SSHServer) publicKeyAuth(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
	return &ssh.Permissions{
		Extensions: map[string]string{
			"auth_type": "publickey",
			"dst_host":  conn.User(),
		},
	}, nil
}

func (s *SSHServer) passwordAuth(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
	return &ssh.Permissions{
		Extensions: map[string]string{
			"auth_type": "password",
			"dst_host":  conn.User(),
		},
	}, nil
}

func (s *SSHServer) addActiveSession(session *ProxySession) {
	s.activeSessionsMu.Lock()
	defer s.activeSessionsMu.Unlock()
	s.activeSessions[session.ID] = session
}

func (s *SSHServer) removeActiveSession(id uuid.UUID) {
	s.activeSessionsMu.Lock()
	defer s.activeSessionsMu.Unlock()
	delete(s.activeSessions, id)
}

func (s *SSHServer) GetActiveSessions() []*ProxySession {
	s.activeSessionsMu.RLock()
	defer s.activeSessionsMu.RUnlock()
	sessions := make([]*ProxySession, 0, len(s.activeSessions))
	for _, s := range s.activeSessions {
		sessions = append(sessions, s)
	}
	return sessions
}

func (s *SSHServer) TerminateSession(id uuid.UUID) bool {
	s.activeSessionsMu.RLock()
	session, exists := s.activeSessions[id]
	s.activeSessionsMu.RUnlock()

	if exists {
		session.cancel()
		return true
	}
	return false
}

func (s *SSHServer) GetActiveSessions() []ha.SessionState {
	s.activeSessionsMu.RLock()
	defer s.activeSessionsMu.RUnlock()

	states := make([]ha.SessionState, 0, len(s.activeSessions))
	for _, session := range s.activeSessions {
		state := ha.SessionState{
			SessionID:    session.ID,
			Username:     session.Username,
			SrcIP:        session.SrcIP,
			DstHost:      session.DstHost,
			DstPort:      session.DstPort,
			StartTime:    session.StartTime,
			BytesWritten: session.BytesWritten,
			BytesRead:    session.BytesRead,
			PTYCols:      session.PTYCols,
			PTYRows:      session.PTYRows,
		}
		states = append(states, state)
	}
	return states
}

func (s *SSHServer) GetSessionState(sessionID uuid.UUID) (*ha.SessionState, bool) {
	s.activeSessionsMu.RLock()
	defer s.activeSessionsMu.RUnlock()

	session, exists := s.activeSessions[sessionID]
	if !exists {
		return nil, false
	}

	state := &ha.SessionState{
		SessionID:    session.ID,
		Username:     session.Username,
		SrcIP:        session.SrcIP,
		DstHost:      session.DstHost,
		DstPort:      session.DstPort,
		StartTime:    session.StartTime,
		BytesWritten: session.BytesWritten,
		BytesRead:    session.BytesRead,
		PTYCols:      session.PTYCols,
		PTYRows:      session.PTYRows,
	}
	return state, true
}

func (s *SSHServer) RestoreSession(state *ha.SessionState) error {
	logrus.Infof("Restoring session %s for user %s to %s:%d",
		state.SessionID, state.Username, state.DstHost, state.DstPort)

	s.activeSessionsMu.RLock()
	_, exists := s.activeSessions[state.SessionID]
	s.activeSessionsMu.RUnlock()

	if exists {
		logrus.Infof("Session %s already exists, skipping restore", state.SessionID)
		return nil
	}

	dbSession := &database.Session{
		ID:        state.SessionID,
		Username:  state.Username,
		SrcIP:     state.SrcIP,
		DstHost:   state.DstHost,
		DstPort:   state.DstPort,
		StartTime: state.StartTime,
		Status:    "restored",
	}
	if err := s.sessionRepo.Create(context.Background(), dbSession); err != nil {
		logrus.Warnf("Failed to create restored session record: %v", err)
	}

	logrus.Infof("Session %s restore initiated - waiting for client reconnection", state.SessionID)
	return nil
}
