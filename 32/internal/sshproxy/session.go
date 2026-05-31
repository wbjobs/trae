package sshproxy

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
	"ssh-bastion-audit/internal/bufferpool"
	"ssh-bastion-audit/internal/database"
)

const (
	maxBatchSize    = 100
	batchFlushInterval = 100 * time.Millisecond
)

type frameBatch struct {
	frames []*bufferpool.PooledTTYFrame
	mu     sync.Mutex
}

func (s *ProxySession) connectToTarget(serverConn *ssh.ServerConn) error {
	clientConfig := &ssh.ClientConfig{
		User: s.Username,
		Auth: []ssh.AuthMethod{
			ssh.PasswordCallback(func() (string, error) {
				return "", nil
			}),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	if authType, ok := serverConn.Permissions.Extensions["auth_type"]; ok {
		switch authType {
		case "password":
			if password, ok := serverConn.Permissions.Extensions["password"]; ok {
				clientConfig.Auth = []ssh.AuthMethod{ssh.Password(password)}
			}
		case "publickey":
		}
	}

	addr := fmt.Sprintf("%s:%d", s.DstHost, s.DstPort)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect to target %s: %w", addr, err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, clientConfig)
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to establish SSH connection to target: %w", err)
	}

	s.ServerConn = ssh.NewClient(sshConn, chans, reqs)

	channel, requests, err := s.ServerConn.OpenChannel("session", nil)
	if err != nil {
		s.ServerConn.Close()
		return fmt.Errorf("failed to open session channel: %w", err)
	}

	s.ServerChannel = channel
	s.ServerRequests = requests

	go ssh.DiscardRequests(requests)

	s.recorder.StartSession(s.ID)

	s.frameBatch = &frameBatch{
		frames: make([]*bufferpool.PooledTTYFrame, 0, maxBatchSize),
	}

	go s.batchFlushLoop()

	return nil
}

func (s *ProxySession) forwardClientToServer() {
	buf := bufferpool.GetMedium()
	defer bufferpool.PutMedium(buf)

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		n, err := s.ClientChannel.Read(*buf)
		if n > 0 {
			data := (*buf)[:n]
			s.recorder.RecordInput(s.ID, data)

			if _, err := s.ServerChannel.Write(data); err != nil {
				logrus.Errorf("Failed to write to server: %v", err)
				return
			}

			s.BytesWritten += int64(n)

			s.appendToBuffer(data, true)
		}
		if err != nil {
			if err != io.EOF {
				logrus.Debugf("Client read error: %v", err)
			}
			return
		}
	}
}

func (s *ProxySession) forwardServerToClient() {
	buf := bufferpool.GetMedium()
	defer bufferpool.PutMedium(buf)

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		n, err := s.ServerChannel.Read(*buf)
		if n > 0 {
			data := (*buf)[:n]
			offsetMs := time.Since(s.StartTime).Milliseconds()

			s.insertTTYFrame(data, offsetMs)

			s.recorder.RecordOutput(s.ID, data, offsetMs)

			if _, err := s.ClientChannel.Write(data); err != nil {
				logrus.Errorf("Failed to write to client: %v", err)
				return
			}

			s.BytesRead += int64(n)

			s.appendToBuffer(data, false)
			s.checkForAlerts(data)
		}
		if err != nil {
			if err != io.EOF {
				logrus.Debugf("Server read error: %v", err)
			}
			return
		}
	}
}

func (s *ProxySession) insertTTYFrame(data []byte, offsetMs int64) {
	frame := bufferpool.GetFrame()
	frame.Time = time.Now()
	frame.SessionID = s.ID
	frame.OffsetMs = offsetMs
	frame.FrameType = "output"

	dataBuf := bufferpool.GetFrameData()
	*dataBuf = append(*dataBuf, data...)
	frame.DataBuf = dataBuf
	frame.Data = *dataBuf

	s.frameBatch.mu.Lock()
	s.frameBatch.frames = append(s.frameBatch.frames, frame)
	shouldFlush := len(s.frameBatch.frames) >= maxBatchSize
	s.frameBatch.mu.Unlock()

	if shouldFlush {
		s.flushBatch()
	}
}

func (s *ProxySession) batchFlushLoop() {
	ticker := time.NewTicker(batchFlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			s.flushBatch()
			return
		case <-ticker.C:
			s.flushBatch()
		}
	}
}

func (s *ProxySession) flushBatch() {
	s.frameBatch.mu.Lock()
	if len(s.frameBatch.frames) == 0 {
		s.frameBatch.mu.Unlock()
		return
	}

	frames := s.frameBatch.frames
	s.frameBatch.frames = make([]*bufferpool.PooledTTYFrame, 0, maxBatchSize)
	s.frameBatch.mu.Unlock()

	defer func() {
		for _, f := range frames {
			bufferpool.PutFrame(f)
		}
	}()

	if err := s.ttyFrameRepo.InsertBatch(s.ctx, frames); err != nil {
		logrus.Errorf("Failed to insert TTY frame batch: %v", err)
	}
}

func (s *ProxySession) appendToBuffer(data []byte, isInput bool) {
	if len(data) == 0 {
		return
	}

	s.TerminalBuffer = append(s.TerminalBuffer, data...)

	if len(s.TerminalBuffer) > 65536 {
		copy(s.TerminalBuffer, s.TerminalBuffer[len(s.TerminalBuffer)-32768:])
		s.TerminalBuffer = s.TerminalBuffer[:32768]
	}

	if isInput {
		for _, b := range data {
			if b == '\r' || b == '\n' {
				if len(s.CurrentCommand) > 0 {
					s.checkCommandAlerts(s.CurrentCommand)
					s.CurrentCommand = ""
				}
			} else if b == 0x7f || b == '\b' {
				if len(s.CurrentCommand) > 0 {
					s.CurrentCommand = s.CurrentCommand[:len(s.CurrentCommand)-1]
				}
			} else if b >= 0x20 && b < 0x7f {
				s.CurrentCommand += string(b)
			}
		}
	}
}

func (s *ProxySession) checkForAlerts(data []byte) {
	if s.alerter == nil {
		return
	}

	alerts := s.alerter.CheckContent(string(data))
	for _, alert := range alerts {
		alert.SessionID = s.ID
		alert.Command = s.CurrentCommand
		if err := s.alertRepo.Create(s.ctx, &alert); err != nil {
			logrus.Errorf("Failed to create alert: %v", err)
		}
		if err := s.sessionRepo.UpdateStats(s.ctx, s.ID, 0, 1); err != nil {
			logrus.Errorf("Failed to update session stats: %v", err)
		}
	}
}

func (s *ProxySession) checkCommandAlerts(command string) {
	if s.alerter == nil {
		return
	}

	alerts := s.alerter.CheckCommand(command)
	for _, alert := range alerts {
		alert.SessionID = s.ID
		alert.Command = command
		if err := s.alertRepo.Create(s.ctx, &alert); err != nil {
			logrus.Errorf("Failed to create alert: %v", err)
		}
		if err := s.sessionRepo.UpdateStats(s.ctx, s.ID, 1, 1); err != nil {
			logrus.Errorf("Failed to update session stats: %v", err)
		}
	}

	if err := s.sessionRepo.UpdateStats(s.ctx, s.ID, 1, 0); err != nil {
		logrus.Errorf("Failed to update session stats: %v", err)
	}
}

func (s *ProxySession) extractLastCommand() string {
	lines := bytes.Split(s.TerminalBuffer, []byte{'\n'})
	for i := len(lines) - 1; i >= 0; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) > 0 {
			return string(line)
		}
	}
	return ""
}
