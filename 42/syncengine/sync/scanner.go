package sync

import (
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pkg/sftp"
)

type FileScanner struct {
	ignorePatterns []string
	excludeHidden bool
}

func NewFileScanner(ignorePatterns []string, excludeHidden bool) *FileScanner {
	return &FileScanner{
		ignorePatterns: ignorePatterns,
		excludeHidden: excludeHidden,
	}
}

func (fs *FileScanner) ScanLocalDir(basePath string) ([]FileInfo, error) {
	var files []FileInfo

	err := filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(basePath, path)
		if err != nil {
			return err
		}

		if relPath == "." {
			return nil
		}

		if fs.shouldIgnore(relPath, info) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		modTime := info.ModTime()
		if modTime.IsZero() {
			modTime = time.Now()
		}

		normalizedPath := filepath.ToSlash(relPath)
		
		fileInfo := FileInfo{
			Path:   normalizedPath,
			Size:   info.Size(),
			Mtime:  modTime.Unix(),
			IsDir:  info.IsDir(),
		}

		files = append(files, fileInfo)
		return nil
	})

	if err != nil {
		return nil, err
	}

	return files, nil
}

func (fs *FileScanner) ScanRemoteDir(client *sftp.Client, basePath string) ([]FileInfo, error) {
	var files []FileInfo

	walker := client.Walk(basePath)
	for walker.Step() {
		if walker.Err() != nil {
			continue
		}

		info := walker.Stat()
		if info == nil {
			continue
		}

		fullPath := walker.Path()
		relPath, err := filepath.Rel(basePath, fullPath)
		if err != nil {
			continue
		}

		if relPath == "." {
			continue
		}

		relPath = filepath.ToSlash(relPath)

		if fs.shouldIgnore(relPath, info) {
			if info.IsDir() {
				walker.SkipDir()
			}
			continue
		}

		modTime := info.ModTime()
		if modTime.IsZero() {
			modTime = time.Now()
		}

		fileInfo := FileInfo{
			Path:   relPath,
			Size:   info.Size(),
			Mtime:  modTime.Unix(),
			IsDir:  info.IsDir(),
		}

		files = append(files, fileInfo)
	}

	return files, nil
}

func (fs *FileScanner) shouldIgnore(path string, info os.FileInfo) bool {
	if fs.excludeHidden {
		name := info.Name()
		if len(name) > 0 && name[0] == '.' {
			return true
		}
	}

	for _, pattern := range fs.ignorePatterns {
		if matchesPattern(path, pattern) {
			return true
		}
	}

	return false
}

func matchesPattern(path, pattern string) bool {
	path = filepath.ToSlash(path)

	if strings.HasPrefix(pattern, "*.") {
		ext := pattern[1:]
		return strings.HasSuffix(path, ext)
	}

	if strings.HasPrefix(pattern, "**/") {
		pattern = pattern[3:]
		return strings.Contains(path, pattern)
	}

	if strings.HasSuffix(pattern, "/") {
		dir := strings.TrimSuffix(pattern, "/")
		if path == dir || strings.HasPrefix(path, dir+"/") {
			return true
		}
		return false
	}

	parts := strings.Split(path, "/")
	for _, part := range parts {
		if part == pattern {
			return true
		}
	}

	return false
}

func BuildFileMap(files []FileInfo) map[string]FileInfo {
	result := make(map[string]FileInfo)
	for _, f := range files {
		result[f.Path] = f
	}
	return result
}

func isValidUTF8(s string) bool {
	return utf8.ValidString(s)
}

func normalizePath(path string) string {
	path = filepath.ToSlash(path)
	if !isValidUTF8(path) {
		return path
	}
	return path
}
