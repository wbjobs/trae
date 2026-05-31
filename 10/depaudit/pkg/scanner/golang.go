package scanner

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type GoScanner struct{}

func (s *GoScanner) CanScan(path string) bool {
	_, err := os.Stat(filepath.Join(path, "go.mod"))
	return err == nil
}

func (s *GoScanner) Scan(path string) ([]Dependency, error) {
	var deps []Dependency
	modPath := filepath.Join(path, "go.mod")
	
	if _, err := os.Stat(modPath); err != nil {
		return deps, fmt.Errorf("go.mod not found in %s", path)
	}
	
	file, err := os.Open(modPath)
	if err != nil {
		return deps, err
	}
	defer file.Close()
	
	scanner := bufio.NewScanner(file)
	inRequire := false
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		
		if strings.HasPrefix(line, "require (") {
			inRequire = true
			continue
		}
		
		if inRequire && line == ")" {
			inRequire = false
			continue
		}
		
		if inRequire {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := parts[0]
				version := strings.TrimPrefix(parts[1], "v")
				
				if !strings.Contains(line, "indirect") {
					deps = append(deps, Dependency{
						Name:           name,
						Version:        version,
						Ecosystem:      "Go",
						PackageManager: "gomod",
						FilePath:       modPath,
					})
				}
			}
		} else if strings.HasPrefix(line, "require ") && !strings.HasPrefix(line, "require (") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				name := parts[1]
				version := strings.TrimPrefix(parts[2], "v")
				deps = append(deps, Dependency{
					Name:           name,
					Version:        version,
					Ecosystem:      "Go",
					PackageManager: "gomod",
					FilePath:       modPath,
				})
			}
		}
	}
	
	return deps, nil
}
