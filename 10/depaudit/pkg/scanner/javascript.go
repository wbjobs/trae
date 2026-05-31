package scanner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type JavaScriptScanner struct{}

type PackageJSON struct {
	Name         string                 `json:"name"`
	Dependencies map[string]string      `json:"dependencies"`
	DevDependencies map[string]string   `json:"devDependencies"`
}

type LockfilePackage struct {
	Version string `json:"version"`
}

type NPMMap map[string]struct {
	Version string `json:"version"`
}

func (s *JavaScriptScanner) CanScan(path string) bool {
	files := []string{"package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
	for _, file := range files {
		if _, err := os.Stat(filepath.Join(path, file)); err == nil {
			return true
		}
	}
	return false
}

func (s *JavaScriptScanner) Scan(path string) ([]Dependency, error) {
	var deps []Dependency
	
	pkgJSONPath := filepath.Join(path, "package.json")
	if _, err := os.Stat(pkgJSONPath); err != nil {
		return deps, fmt.Errorf("package.json not found in %s", path)
	}
	
	data, err := os.ReadFile(pkgJSONPath)
	if err != nil {
		return deps, err
	}
	
	var pkg PackageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return deps, err
	}
	
	packageManager := "npm"
	if _, err := os.Stat(filepath.Join(path, "yarn.lock")); err == nil {
		packageManager = "yarn"
	} else if _, err := os.Stat(filepath.Join(path, "pnpm-lock.yaml")); err == nil {
		packageManager = "pnpm"
	}
	
	for name, version := range pkg.Dependencies {
		deps = append(deps, Dependency{
			Name:           name,
			Version:        strings.TrimLeft(version, "^~>=<"),
			Ecosystem:      "npm",
			PackageManager: packageManager,
			FilePath:       pkgJSONPath,
		})
	}
	
	for name, version := range pkg.DevDependencies {
		deps = append(deps, Dependency{
			Name:           name,
			Version:        strings.TrimLeft(version, "^~>=<"),
			Ecosystem:      "npm",
			PackageManager: packageManager,
			FilePath:       pkgJSONPath,
		})
	}
	
	return deps, nil
}
