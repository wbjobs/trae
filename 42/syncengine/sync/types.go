package sync

import (
	"encoding/json"
	"fmt"
	"time"
)

type FileInfo struct {
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Mtime   int64  `json:"mtime"`
	IsDir   bool   `json:"is_dir"`
	Checksum string `json:"checksum,omitempty"`
}

type SyncDirection string

const (
	DirectionLocalToRemote SyncDirection = "local_to_remote"
	DirectionRemoteToLocal SyncDirection = "remote_to_local"
	DirectionBidirectional SyncDirection = "bidirectional"
)

type ConflictResolution string

const (
	ConflictNewerWins  ConflictResolution = "newer_wins"
	ConflictLocalWins  ConflictResolution = "local_wins"
	ConflictRemoteWins ConflictResolution = "remote_wins"
	ConflictAsk        ConflictResolution = "ask"
	ConflictSkip       ConflictResolution = "skip"
	ConflictAutoMerge  ConflictResolution = "auto_merge"
	ConflictKeepBoth   ConflictResolution = "keep_both"
	ConflictManual     ConflictResolution = "manual"
)

type MergeStrategy string

const (
	MergeLocalFirst  MergeStrategy = "local_first"
	MergeRemoteFirst MergeStrategy = "remote_first"
	MergeLineByLine  MergeStrategy = "line_by_line"
)

type RemoteConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthMethod string `json:"auth_method"`
	Password   string `json:"password,omitempty"`
	KeyFile    string `json:"key_file,omitempty"`
}

type SyncTask struct {
	Name               string             `json:"name"`
	LocalPath          string             `json:"local_path"`
	RemotePath         string             `json:"remote_path"`
	RemoteConfig       RemoteConfig       `json:"remote_config"`
	Direction          SyncDirection      `json:"direction"`
	ConflictResolution ConflictResolution  `json:"conflict_resolution"`
	MergeStrategy      MergeStrategy      `json:"merge_strategy"`
	IgnorePatterns     []string           `json:"ignore_patterns"`
	MaxFileSize        string             `json:"max_file_size"`
	ExcludeHidden      bool               `json:"exclude_hidden"`
	DryRun             bool               `json:"dry_run"`
	Force              bool               `json:"force"`
	Verbose            bool               `json:"verbose"`
	GenerateReport     bool               `json:"generate_report"`
	ReportPath         string             `json:"report_path"`
	ConflictBackup     bool               `json:"conflict_backup"`
	TextFileExtensions []string           `json:"text_file_extensions"`
}

type SyncAction struct {
	Type       string `json:"type"`
	Path       string `json:"path"`
	LocalPath  string `json:"local_path,omitempty"`
	RemotePath string `json:"remote_path,omitempty"`
	Timestamp  int64  `json:"timestamp"`
	Reason     string `json:"reason"`
}

type Conflict struct {
	Path           string    `json:"path"`
	LocalInfo      FileInfo  `json:"local_info"`
	RemoteInfo     FileInfo  `json:"remote_info"`
	Resolution     string    `json:"resolution"`
	MergeResult    string    `json:"merge_result,omitempty"`
	ConflictType   string    `json:"conflict_type"`
	LocalSize      int64     `json:"local_size"`
	RemoteSize     int64     `json:"remote_size"`
	LocalModified  string    `json:"local_modified"`
	RemoteModified string    `json:"remote_modified"`
	BackupPath     string    `json:"backup_path,omitempty"`
	Timestamp      int64     `json:"timestamp"`
}

type SyncResult struct {
	TaskName          string       `json:"task_name"`
	Success           bool         `json:"success"`
	FilesUploaded     int          `json:"files_uploaded"`
	FilesDownloaded   int          `json:"files_downloaded"`
	FilesDeleted      int          `json:"files_deleted"`
	FilesSkipped      int          `json:"files_skipped"`
	FilesMerged      int          `json:"files_merged"`
	FilesKeptBoth    int          `json:"files_kept_both"`
	Conflicts        []Conflict   `json:"conflicts"`
	Errors           []string     `json:"errors"`
	Actions          []SyncAction `json:"actions"`
	Duration         time.Duration `json:"duration"`
	BytesTransferred int64        `json:"bytes_transferred"`
	ReportGenerated  bool         `json:"report_generated"`
	ReportPath       string       `json:"report_path,omitempty"`
}

type ConflictReport struct {
	TaskName       string     `json:"task_name"`
	GeneratedAt    time.Time  `json:"generated_at"`
	TotalConflicts int        `json:"total_conflicts"`
	Conflicts      []Conflict `json:"conflicts"`
	Summary        ReportSummary `json:"summary"`
}

type ReportSummary struct {
	AutoResolved   int `json:"auto_resolved"`
	ManualResolved int `json:"manual_resolved"`
	Skipped        int `json:"skipped"`
	Merged         int `json:"merged"`
	KeptBoth       int `json:"kept_both"`
}

type RemoteListResult struct {
	Path    string     `json:"path"`
	Files   []FileInfo `json:"files"`
	Success bool       `json:"success"`
	Error   string     `json:"error,omitempty"`
}

type PingResult struct {
	Success bool   `json:"success"`
	Host    string `json:"host"`
	Latency string `json:"latency,omitempty"`
	Error   string `json:"error,omitempty"`
}

func (t *SyncTask) ToJSON() ([]byte, error) {
	return json.Marshal(t)
}

func ParseTask(data []byte) (*SyncTask, error) {
	var task SyncTask
	err := json.Unmarshal(data, &task)
	return &task, err
}

func ParseResult(data []byte) (*SyncResult, error) {
	var result SyncResult
	err := json.Unmarshal(data, &result)
	return &result, err
}

func NewConflictReport(result *SyncResult) *ConflictReport {
	report := &ConflictReport{
		TaskName:       result.TaskName,
		GeneratedAt:    time.Now(),
		TotalConflicts: len(result.Conflicts),
		Conflicts:      result.Conflicts,
		Summary: ReportSummary{
			AutoResolved:   0,
			ManualResolved: 0,
			Skipped:        0,
			Merged:         0,
			KeptBoth:       0,
		},
	}

	for _, conflict := range result.Conflicts {
		switch conflict.Resolution {
		case "merged":
			report.Summary.Merged++
		case "kept_both":
			report.Summary.KeptBoth++
		case "skipped":
			report.Summary.Skipped++
		case "manual":
			report.Summary.ManualResolved++
		default:
			report.Summary.AutoResolved++
		}
	}

	return report
}

func (r *ConflictReport) ToJSON() ([]byte, error) {
	return json.MarshalIndent(r, "", "  ")
}

func (r *ConflictReport) ToHTML() string {
	html := `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>FileSync Conflict Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; }
        .summary-card.merged { border-left-color: #2196F3; }
        .summary-card.skipped { border-left-color: #FF9800; }
        .summary-card.manual { border-left-color: #9C27B0; }
        .conflict-list { margin-top: 20px; }
        .conflict-item { background: #fff; border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .conflict-path { font-weight: bold; color: #333; font-size: 16px; }
        .conflict-details { margin-top: 10px; color: #666; }
        .conflict-details table { width: 100%; border-collapse: collapse; }
        .conflict-details td { padding: 5px 10px; border: 1px solid #eee; }
        .conflict-details td:first-child { font-weight: bold; width: 150px; }
        .resolution { margin-top: 10px; padding: 10px; background: #e8f5e9; border-radius: 4px; }
        .resolution.merged { background: #e3f2fd; }
        .resolution.manual { background: #f3e5f5; }
        .timestamp { color: #999; font-size: 12px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>FileSync Conflict Report</h1>
        <p><strong>Task:</strong> ` + r.TaskName + `</p>
        <p class="timestamp">Generated at: ` + r.GeneratedAt.Format("2006-01-02 15:04:05") + `</p>

        <h2>Summary</h2>
        <div class="summary">
            <div class="summary-card">
                <div style="font-size: 24px; font-weight: bold;">` + fmt.Sprintf("%d", r.Summary.AutoResolved) + `</div>
                <div>Auto Resolved</div>
            </div>
            <div class="summary-card merged">
                <div style="font-size: 24px; font-weight: bold;">` + fmt.Sprintf("%d", r.Summary.Merged) + `</div>
                <div>Merged</div>
            </div>
            <div class="summary-card">
                <div style="font-size: 24px; font-weight: bold;">` + fmt.Sprintf("%d", r.Summary.KeptBoth) + `</div>
                <div>Kept Both</div>
            </div>
            <div class="summary-card skipped">
                <div style="font-size: 24px; font-weight: bold;">` + fmt.Sprintf("%d", r.Summary.Skipped) + `</div>
                <div>Skipped</div>
            </div>
        </div>

        <h2>Conflicts Details</h2>
        <div class="conflict-list">`

	for _, conflict := range r.Conflicts {
		html += `
            <div class="conflict-item">
                <div class="conflict-path">` + conflict.Path + `</div>
                <div class="conflict-details">
                    <table>
                        <tr><td>Conflict Type</td><td>` + conflict.ConflictType + `</td></tr>
                        <tr><td>Local Size</td><td>` + FormatBytes(conflict.LocalSize) + `</td></tr>
                        <tr><td>Remote Size</td><td>` + FormatBytes(conflict.RemoteSize) + `</td></tr>
                        <tr><td>Local Modified</td><td>` + conflict.LocalModified + `</td></tr>
                        <tr><td>Remote Modified</td><td>` + conflict.RemoteModified + `</td></tr>
                    </table>
                </div>
                <div class="resolution ` + conflict.Resolution + `">
                    <strong>Resolution:</strong> ` + conflict.Resolution
		if conflict.MergeResult != "" {
			html += `<br><small>` + conflict.MergeResult + `</small>`
		}
		if conflict.BackupPath != "" {
			html += `<br><small>Backup: ` + conflict.BackupPath + `</small>`
		}
		html += `</div>
            </div>`
	}

	html += `
        </div>
    </div>
</body>
</html>`

	return html
}

func FormatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
