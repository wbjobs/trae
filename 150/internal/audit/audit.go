package audit

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type CommandRecord struct {
	ID        int64
	SessionID string
	Server    string
	User      string
	Command   string
	Timestamp time.Time
}

type CommandCount struct {
	Command string
	Count   int
}

type Auditor struct {
	mu   sync.Mutex
	db   *sql.DB
	path string
}

var (
	globalAuditor *Auditor
	once          sync.Once
)

func Init(dbPath string) (*Auditor, error) {
	var initErr error
	once.Do(func() {
		dir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			initErr = fmt.Errorf("create audit db dir: %w", err)
			return
		}

		db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
		if err != nil {
			initErr = fmt.Errorf("open audit db: %w", err)
			return
		}

		db.SetMaxOpenConns(1)

		createTableSQL := `
		CREATE TABLE IF NOT EXISTS commands (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			server TEXT NOT NULL,
			"user" TEXT NOT NULL,
			command TEXT NOT NULL,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_commands_server ON commands(server);
		CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp);
		CREATE INDEX IF NOT EXISTS idx_commands_command ON commands(command);
		`

		if _, err := db.Exec(createTableSQL); err != nil {
			db.Close()
			initErr = fmt.Errorf("create audit tables: %w", err)
			return
		}

		globalAuditor = &Auditor{
			db:   db,
			path: dbPath,
		}
	})

	if initErr != nil {
		return nil, initErr
	}
	return globalAuditor, nil
}

func GetAuditor() *Auditor {
	return globalAuditor
}

func (a *Auditor) Record(sessionID, server, user, command string) error {
	if a == nil || a.db == nil {
		return fmt.Errorf("auditor not initialized")
	}

	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	_, err := a.db.Exec(
		"INSERT INTO commands (session_id, server, \"user\", command) VALUES (?, ?, ?, ?)",
		sessionID, server, user, command,
	)
	if err != nil {
		return fmt.Errorf("insert command record: %w", err)
	}
	return nil
}

func (a *Auditor) Search(server string, keyword string, limit int) ([]CommandRecord, error) {
	if a == nil || a.db == nil {
		return nil, fmt.Errorf("auditor not initialized")
	}

	if limit <= 0 {
		limit = 50
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	var (
		rows *sql.Rows
		err  error
	)

	if server != "" && keyword != "" {
		rows, err = a.db.Query(
			`SELECT id, session_id, server, "user", command, timestamp 
			 FROM commands WHERE server = ? AND command LIKE ? 
			 ORDER BY timestamp DESC LIMIT ?`,
			server, "%"+keyword+"%", limit,
		)
	} else if server != "" {
		rows, err = a.db.Query(
			`SELECT id, session_id, server, "user", command, timestamp 
			 FROM commands WHERE server = ? 
			 ORDER BY timestamp DESC LIMIT ?`,
			server, limit,
		)
	} else if keyword != "" {
		rows, err = a.db.Query(
			`SELECT id, session_id, server, "user", command, timestamp 
			 FROM commands WHERE command LIKE ? 
			 ORDER BY timestamp DESC LIMIT ?`,
			"%"+keyword+"%", limit,
		)
	} else {
		rows, err = a.db.Query(
			`SELECT id, session_id, server, "user", command, timestamp 
			 FROM commands ORDER BY timestamp DESC LIMIT ?`,
			limit,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("search commands: %w", err)
	}
	defer rows.Close()

	var results []CommandRecord
	for rows.Next() {
		var rec CommandRecord
		err := rows.Scan(&rec.ID, &rec.SessionID, &rec.Server, &rec.User, &rec.Command, &rec.Timestamp)
		if err != nil {
			return nil, fmt.Errorf("scan command: %w", err)
		}
		results = append(results, rec)
	}
	return results, rows.Err()
}

func (a *Auditor) TopCommands(server string, limit int) ([]CommandCount, error) {
	if a == nil || a.db == nil {
		return nil, fmt.Errorf("auditor not initialized")
	}

	if limit <= 0 {
		limit = 10
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	var (
		rows *sql.Rows
		err  error
	)

	if server != "" {
		rows, err = a.db.Query(
			`SELECT command, COUNT(*) as cnt 
			 FROM commands WHERE server = ? 
			 GROUP BY command ORDER BY cnt DESC LIMIT ?`,
			server, limit,
		)
	} else {
		rows, err = a.db.Query(
			`SELECT command, COUNT(*) as cnt 
			 FROM commands 
			 GROUP BY command ORDER BY cnt DESC LIMIT ?`,
			limit,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("top commands: %w", err)
	}
	defer rows.Close()

	var results []CommandCount
	for rows.Next() {
		var cc CommandCount
		if err := rows.Scan(&cc.Command, &cc.Count); err != nil {
			return nil, fmt.Errorf("scan top command: %w", err)
		}
		results = append(results, cc)
	}
	return results, rows.Err()
}

func (a *Auditor) Stats(server string) (totalCommands int, uniqueCommands int, firstSeen, lastSeen time.Time, err error) {
	if a == nil || a.db == nil {
		err = fmt.Errorf("auditor not initialized")
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if server != "" {
		err = a.db.QueryRow(
			`SELECT COUNT(*), COUNT(DISTINCT command), MIN(timestamp), MAX(timestamp) 
			 FROM commands WHERE server = ?`,
			server,
		).Scan(&totalCommands, &uniqueCommands, &firstSeen, &lastSeen)
	} else {
		err = a.db.QueryRow(
			`SELECT COUNT(*), COUNT(DISTINCT command), MIN(timestamp), MAX(timestamp) 
			 FROM commands`,
		).Scan(&totalCommands, &uniqueCommands, &firstSeen, &lastSeen)
	}
	return
}

func (a *Auditor) ListServers() ([]string, error) {
	if a == nil || a.db == nil {
		return nil, fmt.Errorf("auditor not initialized")
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	rows, err := a.db.Query(`SELECT DISTINCT server FROM commands ORDER BY server`)
	if err != nil {
		return nil, fmt.Errorf("list servers: %w", err)
	}
	defer rows.Close()

	var servers []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		servers = append(servers, s)
	}
	return servers, rows.Err()
}

func (a *Auditor) Close() error {
	if a != nil && a.db != nil {
		return a.db.Close()
	}
	return nil
}
