package scanner

import (
	"fmt"
	"time"
)

type DependencyScanner interface {
	CanScan(path string) bool
	Scan(path string) ([]Dependency, error)
}

type Scanner struct {
	scanners map[string]DependencyScanner
}

func NewScanner() *Scanner {
	return &Scanner{
		scanners: map[string]DependencyScanner{
			"javascript": &JavaScriptScanner{},
			"python":     &PythonScanner{},
			"java":       &JavaScanner{},
			"golang":     &GoScanner{},
		},
	}
}

func (s *Scanner) ScanProject(path string) (*ScanResult, error) {
	result := &ScanResult{
		ProjectPath: path,
		ScanTime:    time.Now(),
	}
	
	for lang, scanner := range s.scanners {
		if scanner.CanScan(path) {
			deps, err := scanner.Scan(path)
			if err != nil {
				return nil, err
			}
			result.Dependencies = deps
			result.Language = lang
			return result, nil
		}
	}
	
	return nil, fmt.Errorf("unsupported project type in %s", path)
}

func (s *Scanner) GetAllScanners() map[string]DependencyScanner {
	return s.scanners
}
