package scanner

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type PythonScanner struct{}

func (s *PythonScanner) CanScan(path string) bool {
	files := []string{"requirements.txt", "Pipfile", "pyproject.toml", "setup.py"}
	for _, file := range files {
		if _, err := os.Stat(filepath.Join(path, file)); err == nil {
			return true
		}
	}
	return false
}

func (s *PythonScanner) Scan(path string) ([]Dependency, error) {
	var deps []Dependency
	
	if d, err := s.scanRequirements(path); err == nil {
		deps = append(deps, d...)
	}
	if d, err := s.scanPipfile(path); err == nil {
		deps = append(deps, d...)
	}
	if d, err := s.scanPyproject(path); err == nil {
		deps = append(deps, d...)
	}
	
	return deps, nil
}

func (s *PythonScanner) scanRequirements(path string) ([]Dependency, error) {
	var deps []Dependency
	reqPath := filepath.Join(path, "requirements.txt")
	
	if _, err := os.Stat(reqPath); err != nil {
		return deps, err
	}
	
	file, err := os.Open(reqPath)
	if err != nil {
		return deps, err
	}
	defer file.Close()
	
	packageManager := "pip"
	if _, err := os.Stat(filepath.Join(path, "Pipfile")); err == nil {
		packageManager = "pipenv"
	} else if _, err := os.Stat(filepath.Join(path, "poetry.lock")); err == nil {
		packageManager = "poetry"
	}
	
	re := regexp.MustCompile(`^([a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9])\s*((?:==|>=|<=|>|<|~=|!=)\s*[0-9a-zA-Z.*]+(?:\s*,\s*(?:==|>=|<=|>|<|~=|!=)\s*[0-9a-zA-Z.*]+)*)`)
	scanner := bufio.NewScanner(file)
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		
		if idx := strings.Index(line, ";"); idx != -1 {
			line = strings.TrimSpace(line[:idx])
		}
		
		if idx := strings.Index(line, "#"); idx != -1 {
			line = strings.TrimSpace(line[:idx])
		}
		
		if line == "" {
			continue
		}
		
		matches := re.FindStringSubmatch(line)
		if len(matches) >= 2 {
			name := matches[1]
			version := ""
			if len(matches) >= 3 {
				version = strings.TrimSpace(matches[2])
			}
			deps = append(deps, Dependency{
				Name:           strings.ToLower(name),
				Version:        version,
				Ecosystem:      "PyPI",
				PackageManager: packageManager,
				FilePath:       reqPath,
			})
		}
	}
	
	return deps, nil
}

func (s *PythonScanner) scanPipfile(path string) ([]Dependency, error) {
	var deps []Dependency
	pipfilePath := filepath.Join(path, "Pipfile")
	
	if _, err := os.Stat(pipfilePath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pipfilePath)
	if err != nil {
		return deps, err
	}
	
	lines := strings.Split(string(data), "\n")
	inPackages := false
	inDevPackages := false
	
	re := regexp.MustCompile(`([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"`)
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		if strings.Contains(line, "[packages]") {
			inPackages = true
			inDevPackages = false
			continue
		}
		if strings.Contains(line, "[dev-packages]") {
			inPackages = false
			inDevPackages = true
			continue
		}
		if strings.HasPrefix(line, "[") {
			inPackages = false
			inDevPackages = false
			continue
		}
		
		if inPackages || inDevPackages {
			matches := re.FindStringSubmatch(line)
			if len(matches) >= 3 {
				version := strings.Trim(matches[2], "*~>=<")
				if version == "" {
					version = "*"
				}
				deps = append(deps, Dependency{
					Name:           strings.ToLower(matches[1]),
					Version:        version,
					Ecosystem:      "PyPI",
					PackageManager: "pipenv",
					FilePath:       pipfilePath,
				})
			}
		}
	}
	
	return deps, nil
}

func (s *PythonScanner) scanPyproject(path string) ([]Dependency, error) {
	var deps []Dependency
	pyprojectPath := filepath.Join(path, "pyproject.toml")
	
	if _, err := os.Stat(pyprojectPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pyprojectPath)
	if err != nil {
		return deps, err
	}
	
	lines := strings.Split(string(data), "\n")
	
	depPatterns := []*regexp.Regexp{
		regexp.MustCompile(`([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"`),
		regexp.MustCompile(`"([a-zA-Z0-9_-]+)([=<>~][^"]+)"`),
	}
	
	for _, line := range lines {
		for _, re := range depPatterns {
			matches := re.FindStringSubmatch(line)
			if len(matches) >= 2 {
				name := matches[1]
				version := ""
				if len(matches) >= 3 {
					version = strings.Trim(matches[2], "^~>=<\"'")
				}
				deps = append(deps, Dependency{
					Name:           strings.ToLower(name),
					Version:        version,
					Ecosystem:      "PyPI",
					PackageManager: "poetry",
					FilePath:       pyprojectPath,
				})
			}
		}
	}
	
	return deps, nil
}

func (s *PythonScanner) detectPackageManager(path string) string {
	if _, err := os.Stat(filepath.Join(path, "poetry.lock")); err == nil {
		return "poetry"
	}
	if _, err := os.Stat(filepath.Join(path, "Pipfile.lock")); err == nil {
		return "pipenv"
	}
	return "pip"
}
