package sync

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type MergeResult struct {
	Success     bool
	Content     string
	Strategy    string
	Conflicts   int
	LocalOnly   int
	RemoteOnly  int
	Error       error
}

type Merger struct {
	strategy    MergeStrategy
	textExtensions []string
	backupDir   string
	verbose     bool
}

func NewMerger(strategy MergeStrategy, textExtensions []string, backupDir string, verbose bool) *Merger {
	if textExtensions == nil {
		textExtensions = []string{
			".txt", ".md", ".json", ".xml", ".yaml", ".yml",
			".html", ".css", ".js", ".ts", ".py", ".go",
			".java", ".c", ".cpp", ".h", ".sh", ".bat",
			".ini", ".conf", ".cfg", ".log",
		}
	}

	return &Merger{
		strategy:       strategy,
		textExtensions: textExtensions,
		backupDir:      backupDir,
		verbose:        verbose,
	}
}

func (m *Merger) IsTextFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	for _, textExt := range m.textExtensions {
		if ext == textExt {
			return true
		}
	}
	return false
}

func (m *Merger) Merge(localPath, remotePath string) (*MergeResult, error) {
	if !m.IsTextFile(localPath) {
		return m.simpleMerge(localPath, remotePath)
	}

	switch m.strategy {
	case MergeLocalFirst:
		return m.mergeLocalFirst(localPath, remotePath)
	case MergeRemoteFirst:
		return m.mergeRemoteFirst(localPath, remotePath)
	case MergeLineByLine:
		return m.mergeLineByLine(localPath, remotePath)
	default:
		return m.mergeLocalFirst(localPath, remotePath)
	}
}

func (m *Merger) simpleMerge(localPath, remotePath string) (*MergeResult, error) {
	localContent, err := os.ReadFile(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read local file: %w", err)
	}

	return &MergeResult{
		Success:   true,
		Content:    string(localContent),
		Strategy:   "simple_local",
		Conflicts:  0,
		LocalOnly:  0,
		RemoteOnly: 0,
	}, nil
}

func (m *Merger) mergeLocalFirst(localPath, remotePath string) (*MergeResult, error) {
	localContent, err := os.ReadFile(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read local file: %w", err)
	}

	return &MergeResult{
		Success:   true,
		Content:    string(localContent),
		Strategy:   "local_first",
		Conflicts:  0,
		LocalOnly:  0,
		RemoteOnly: 0,
	}, nil
}

func (m *Merger) mergeRemoteFirst(localPath, remotePath string) (*MergeResult, error) {
	remoteContent, err := os.ReadFile(remotePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read remote file: %w", err)
	}

	return &MergeResult{
		Success:   true,
		Content:    string(remoteContent),
		Strategy:   "remote_first",
		Conflicts:  0,
		LocalOnly:  0,
		RemoteOnly: 0,
	}, nil
}

func (m *Merger) mergeLineByLine(localPath, remotePath string) (*MergeResult, error) {
	localContent, err := os.ReadFile(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read local file: %w", err)
	}

	remoteContent, err := os.ReadFile(remotePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read remote file: %w", err)
	}

	localLines := m.splitLines(string(localContent))
	remoteLines := m.splitLines(string(remoteContent))

	mergedLines := make([]string, 0)
	localMap := m.buildLineMap(localLines)
	remoteMap := m.buildLineMap(remoteLines)

	allLines := make(map[string]bool)
	for line := range localMap {
		allLines[line] = true
	}
	for line := range remoteMap {
		allLines[line] = true
	}

	for line := range allLines {
		_, inLocal := localMap[line]
		_, inRemote := remoteMap[line]

		if inLocal && inRemote {
			mergedLines = append(mergedLines, line)
		} else if inLocal && !inRemote {
			mergedLines = append(mergedLines, line)
		} else if !inLocal && inRemote {
			mergedLines = append(mergedLines, line)
		}
	}

	mergedContent := strings.Join(mergedLines, "\n")

	localOnly := len(localMap) - len(mergedLines)
	remoteOnly := len(remoteMap) - len(mergedLines)

	if m.verbose {
		fmt.Printf("Merged %d lines (local only: %d, remote only: %d)\n",
			len(mergedLines), localOnly, remoteOnly)
	}

	return &MergeResult{
		Success:    true,
		Content:     mergedContent,
		Strategy:    "line_by_line",
		Conflicts:   0,
		LocalOnly:   localOnly,
		RemoteOnly:  remoteOnly,
	}, nil
}

func (m *Merger) splitLines(content string) []string {
	var lines []string
	scanner := bufio.NewScanner(bytes.NewReader([]byte(content)))
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}

func (m *Merger) buildLineMap(lines []string) map[string]int {
	lineMap := make(map[string]int)
	for _, line := range lines {
		lineMap[line]++
	}
	return lineMap
}

func (m *Merger) CreateBackup(path string) (string, error) {
	if m.backupDir == "" {
		return "", nil
	}

	stat, err := os.Stat(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	filename := filepath.Base(path)
	backupName := fmt.Sprintf("%s_%s_%s",
		filename,
		time.Now().Format("20060102_150405"),
		"backup")
	backupPath := filepath.Join(m.backupDir, backupName)

	if err := os.MkdirAll(m.backupDir, 0755); err != nil {
		return "", err
	}

	sourceFile, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(backupPath)
	if err != nil {
		return "", err
	}
	defer destFile.Close()

	buffer := make([]byte, 32*1024)
	for {
		n, err := sourceFile.Read(buffer)
		if n > 0 {
			if _, writeErr := destFile.Write(buffer[:n]); writeErr != nil {
				return "", writeErr
			}
		}
		if err != nil {
			break
		}
	}

	return backupPath, nil
}

func (m *Merger) SaveMergedFile(path, content string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(path, []byte(content), 0644)
}
