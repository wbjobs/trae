package ha

import (
	"bytes"
	"encoding/gob"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

func marshal(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func unmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

type SessionState struct {
	SessionID     uuid.UUID  `json:"session_id"`
	Username      string     `json:"username"`
	SrcIP         string     `json:"src_ip"`
	DstHost       string     `json:"dst_host"`
	DstPort       int        `json:"dst_port"`
	StartTime     time.Time  `json:"start_time"`
	BytesWritten  int64      `json:"bytes_written"`
	BytesRead     int64      `json:"bytes_read"`
	CommandCount  int        `json:"command_count"`
	AlertCount    int        `json:"alert_count"`
	OwnerNode     string     `json:"owner_node"`
	LastSyncTime  time.Time  `json:"last_sync_time"`
	TerminalState []byte     `json:"terminal_state,omitempty"`
	AuthType      string     `json:"auth_type,omitempty"`
	PTYCols       int        `json:"pty_cols,omitempty"`
	PTYRows       int        `json:"pty_rows,omitempty"`
}

func MarshalSessionState(s *SessionState) ([]byte, error) {
	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(s); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func UnmarshalSessionState(data []byte) (*SessionState, error) {
	var s SessionState
	buf := bytes.NewBuffer(data)
	dec := gob.NewDecoder(buf)
	if err := dec.Decode(&s); err != nil {
		return nil, err
	}
	return &s, nil
}

type SessionStateBatch struct {
	NodeID    string            `json:"node_id"`
	Timestamp time.Time         `json:"timestamp"`
	Sessions  []*SessionState   `json:"sessions"`
}

func init() {
	gob.Register(&SessionState{})
	gob.Register(&SessionStateBatch{})
	gob.Register(uuid.UUID{})
	gob.Register(time.Time{})
}
