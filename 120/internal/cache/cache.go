package cache

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"cloudinspector/internal/types"
)

const (
	defaultCacheDir  = ".cloudinspector"
	defaultCacheFile = "cache.db"
)

type CacheManager struct {
	db   *sql.DB
	path string
	mu   sync.RWMutex
}

type cachedEntry struct {
	ResourceKey  string
	Provider     string
	Account      string
	Region       string
	ResourceType string
	ResourceID   string
	ResourceName string
	Fingerprint  string
	ResourceJSON string
	RisksJSON    string
	UpdatedAt    time.Time
}

func NewCacheManager(customPath string) (*CacheManager, error) {
	path := customPath
	if path == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("get home directory: %w", err)
		}
		dir := filepath.Join(homeDir, defaultCacheDir)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("create cache dir: %w", err)
		}
		path = filepath.Join(dir, defaultCacheFile)
	}

	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open cache database: %w", err)
	}

	cm := &CacheManager{db: db, path: path}
	if err := cm.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("init schema: %w", err)
	}

	return cm, nil
}

func (cm *CacheManager) initSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS cached_resources (
			resource_key TEXT PRIMARY KEY,
			provider     TEXT NOT NULL,
			account      TEXT NOT NULL,
			region       TEXT NOT NULL,
			resource_type TEXT NOT NULL,
			resource_id   TEXT NOT NULL,
			resource_name TEXT NOT NULL DEFAULT '',
			fingerprint  TEXT NOT NULL,
			resource_json TEXT NOT NULL,
			risks_json   TEXT NOT NULL DEFAULT '[]',
			updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_account ON cached_resources(account)`,
		`CREATE INDEX IF NOT EXISTS idx_type ON cached_resources(resource_type)`,
		`CREATE TABLE IF NOT EXISTS scan_snapshots (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			account       TEXT NOT NULL,
			provider      TEXT NOT NULL,
			resource_count INTEGER NOT NULL DEFAULT 0,
			risk_count     INTEGER NOT NULL DEFAULT 0,
			scanned_at    DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for _, stmt := range stmts {
		if _, err := cm.db.Exec(stmt); err != nil {
			return fmt.Errorf("exec %q: %w", stmt[:50], err)
		}
	}
	return nil
}

func (cm *CacheManager) Close() error {
	return cm.db.Close()
}

func (cm *CacheManager) Path() string {
	return cm.path
}

func resourceKey(r types.Resource) string {
	return fmt.Sprintf("%s:%s:%s:%s:%s",
		r.Provider, r.Account, r.Region, r.Type, r.ID)
}

func ComputeFingerprint(r types.Resource) string {
	parts := make([]string, 0, len(r.Properties)+4)
	parts = append(parts,
		string(r.Provider),
		string(r.Type),
		r.Region,
		r.Status,
	)

	keys := make([]string, 0, len(r.Properties))
	for k := range r.Properties {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		v := fmt.Sprintf("%v", r.Properties[k])
		parts = append(parts, k+"="+v)
	}

	h := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(h[:16])
}

func (cm *CacheManager) GetCachedEntry(provider, account, region, resType, resID string) (*cachedEntry, error) {
	key := fmt.Sprintf("%s:%s:%s:%s:%s", provider, account, region, resType, resID)
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var entry cachedEntry
	err := cm.db.QueryRow(
		`SELECT resource_key, provider, account, region, resource_type, resource_id,
		        resource_name, fingerprint, resource_json, risks_json, updated_at
		 FROM cached_resources WHERE resource_key = ?`, key,
	).Scan(&entry.ResourceKey, &entry.Provider, &entry.Account, &entry.Region,
		&entry.ResourceType, &entry.ResourceID, &entry.ResourceName,
		&entry.Fingerprint, &entry.ResourceJSON, &entry.RisksJSON, &entry.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query cache: %w", err)
	}
	return &entry, nil
}

type CachedResult struct {
	Resources    []types.Resource
	Risks        []types.RiskItem
	UncachedKeys []string
}

func (cm *CacheManager) CheckIncremental(resources []types.Resource, account, region string) *CachedResult {
	result := &CachedResult{}
	if len(resources) == 0 {
		return result
	}

	cm.mu.RLock()
	defer cm.mu.RUnlock()

	for _, r := range resources {
		key := resourceKey(r)
		newFp := ComputeFingerprint(r)

		var cachedFp string
		var risksJSON string
		err := cm.db.QueryRow(
			`SELECT fingerprint, risks_json FROM cached_resources WHERE resource_key = ?`, key,
		).Scan(&cachedFp, &risksJSON)

		if err == sql.ErrNoRows {
			result.UncachedKeys = append(result.UncachedKeys, key)
			continue
		}
		if err != nil {
			result.UncachedKeys = append(result.UncachedKeys, key)
			continue
		}

		if cachedFp == newFp {
			result.Resources = append(result.Resources, r)
			var cachedRisks []types.RiskItem
			if err := json.Unmarshal([]byte(risksJSON), &cachedRisks); err == nil {
				result.Risks = append(result.Risks, cachedRisks...)
			}
		} else {
			result.UncachedKeys = append(result.UncachedKeys, key)
		}
	}

	return result
}

func (cm *CacheManager) SaveResourceAndRisks(r types.Resource, risks []types.RiskItem) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	key := resourceKey(r)
	fp := ComputeFingerprint(r)

	resJSON, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("marshal resource: %w", err)
	}
	risksJSON, err := json.Marshal(risks)
	if err != nil {
		return fmt.Errorf("marshal risks: %w", err)
	}

	_, err = cm.db.Exec(
		`INSERT INTO cached_resources (resource_key, provider, account, region, resource_type,
		 resource_id, resource_name, fingerprint, resource_json, risks_json, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(resource_key) DO UPDATE SET
		   resource_name = excluded.resource_name,
		   fingerprint = excluded.fingerprint,
		   resource_json = excluded.resource_json,
		   risks_json = excluded.risks_json,
		   updated_at = CURRENT_TIMESTAMP`,
		key, r.Provider, r.Account, r.Region, r.Type,
		r.ID, r.Name, fp, string(resJSON), string(risksJSON),
	)
	if err != nil {
		return fmt.Errorf("upsert cache: %w", err)
	}
	return nil
}

func (cm *CacheManager) BatchSave(results []types.ScanResult) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	tx, err := cm.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(
		`INSERT INTO cached_resources (resource_key, provider, account, region, resource_type,
		 resource_id, resource_name, fingerprint, resource_json, risks_json, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(resource_key) DO UPDATE SET
		   resource_name = excluded.resource_name,
		   fingerprint = excluded.fingerprint,
		   resource_json = excluded.resource_json,
		   risks_json = excluded.risks_json,
		   updated_at = CURRENT_TIMESTAMP`,
	)
	if err != nil {
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	for _, result := range results {
		risksByResource := make(map[string][]types.RiskItem)
		for _, risk := range result.Risks {
			key := fmt.Sprintf("%s:%s:%s:%s:%s",
				risk.Provider, risk.Account, risk.Region, risk.ResourceType, risk.ResourceID)
			risksByResource[key] = append(risksByResource[key], risk)
		}

		for _, r := range result.Resources {
			key := resourceKey(r)
			fp := ComputeFingerprint(r)

			resJSON, err := json.Marshal(r)
			if err != nil {
				continue
			}
			risksJSON := "[]"
			if rs, ok := risksByResource[key]; ok {
				if data, err := json.Marshal(rs); err == nil {
					risksJSON = string(data)
				}
			}

			_, err := stmt.Exec(key, r.Provider, r.Account, r.Region, r.Type,
				r.ID, r.Name, fp, string(resJSON), risksJSON)
			if err != nil {
				return fmt.Errorf("exec stmt: %w", err)
			}
		}

		_, err := tx.Exec(
			`INSERT INTO scan_snapshots (account, provider, resource_count, risk_count) VALUES (?, ?, ?, ?)`,
			result.Account, result.Provider, len(result.Resources), len(result.Risks),
		)
		if err != nil {
			return fmt.Errorf("insert snapshot: %w", err)
		}
	}

	return tx.Commit()
}

func (cm *CacheManager) PurgeStale(currentKeys map[string]bool, account string) (int, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	rows, err := cm.db.Query(
		`SELECT resource_key FROM cached_resources WHERE account = ?`, account,
	)
	if err != nil {
		return 0, fmt.Errorf("query cached keys: %w", err)
	}
	defer rows.Close()

	var toDelete []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return 0, err
		}
		if !currentKeys[key] {
			toDelete = append(toDelete, key)
		}
	}

	if len(toDelete) == 0 {
		return 0, nil
	}

	tx, err := cm.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`DELETE FROM cached_resources WHERE resource_key = ?`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	for _, key := range toDelete {
		if _, err := stmt.Exec(key); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return len(toDelete), nil
}

func (cm *CacheManager) GetStats() (totalResources int, totalAccounts int, lastScan *time.Time, err error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	err = cm.db.QueryRow(`SELECT COUNT(*) FROM cached_resources`).Scan(&totalResources)
	if err != nil {
		return
	}
	err = cm.db.QueryRow(`SELECT COUNT(DISTINCT account) FROM cached_resources`).Scan(&totalAccounts)
	if err != nil {
		return
	}

	var t sql.NullTime
	err = cm.db.QueryRow(`SELECT MAX(scanned_at) FROM scan_snapshots`).Scan(&t)
	if err != nil {
		return
	}
	if t.Valid {
		lastScan = &t.Time
	}
	return
}
