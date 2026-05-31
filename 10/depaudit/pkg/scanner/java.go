package scanner

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type JavaScanner struct{}

type MavenProject struct {
	XMLName       xml.Name `xml:"project"`
	Parent        MavenParent `xml:"parent"`
	GroupId       string   `xml:"groupId"`
	ArtifactId    string   `xml:"artifactId"`
	Version       string   `xml:"version"`
	Dependencies  MavenDependencies `xml:"dependencies"`
	DependencyManagement MavenDepManagement `xml:"dependencyManagement"`
	Properties    map[string]string `xml:"properties"`
}

type MavenParent struct {
	GroupId    string `xml:"groupId"`
	ArtifactId string `xml:"artifactId"`
	Version    string `xml:"version"`
}

type MavenDependencies struct {
	Dependencies []MavenDependency `xml:"dependency"`
}

type MavenDepManagement struct {
	Dependencies MavenDependencies `xml:"dependencies"`
}

type MavenDependency struct {
	GroupId    string `xml:"groupId"`
	ArtifactId string `xml:"artifactId"`
	Version    string `xml:"version"`
	Scope      string `xml:"scope"`
}

func (s *JavaScanner) CanScan(path string) bool {
	files := []string{"pom.xml", "build.gradle", "build.gradle.kts"}
	for _, file := range files {
		if _, err := os.Stat(filepath.Join(path, file)); err == nil {
			return true
		}
	}
	return false
}

func (s *JavaScanner) Scan(path string) ([]Dependency, error) {
	var deps []Dependency
	
	if d, err := s.scanMaven(path); err == nil {
		deps = append(deps, d...)
	}
	if d, err := s.scanGradle(path); err == nil {
		deps = append(deps, d...)
	}
	
	return deps, nil
}

func (s *JavaScanner) scanMaven(path string) ([]Dependency, error) {
	var deps []Dependency
	pomPath := filepath.Join(path, "pom.xml")
	
	if _, err := os.Stat(pomPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pomPath)
	if err != nil {
		return deps, err
	}
	
	var project MavenProject
	if err := xml.Unmarshal(data, &project); err != nil {
		return deps, err
	}
	
	for _, dep := range project.Dependencies.Dependencies {
		if dep.Scope == "test" || dep.Version == "" {
			continue
		}
		deps = append(deps, Dependency{
			Name:           fmt.Sprintf("%s:%s", dep.GroupId, dep.ArtifactId),
			Version:        dep.Version,
			Ecosystem:      "Maven",
			PackageManager: "maven",
			FilePath:       pomPath,
		})
	}
	
	return deps, nil
}

func (s *JavaScanner) scanGradle(path string) ([]Dependency, error) {
	var deps []Dependency
	
	gradlePaths := []string{
		filepath.Join(path, "build.gradle"),
		filepath.Join(path, "build.gradle.kts"),
	}
	
	var gradlePath string
	for _, p := range gradlePaths {
		if _, err := os.Stat(p); err == nil {
			gradlePath = p
			break
		}
	}
	
	if gradlePath == "" {
		return deps, fmt.Errorf("no build.gradle found")
	}
	
	data, err := os.ReadFile(gradlePath)
	if err != nil {
		return deps, err
	}
	
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`implementation\s+['"]([^:]+):([^:]+):([^'"]+)['"]`),
		regexp.MustCompile(`api\s+['"]([^:]+):([^:]+):([^'"]+)['"]`),
		regexp.MustCompile(`compile\s+['"]([^:]+):([^:]+):([^'"]+)['"]`),
		regexp.MustCompile(`compileOnly\s+['"]([^:]+):([^:]+):([^'"]+)['"]`),
		regexp.MustCompile(`runtimeOnly\s+['"]([^:]+):([^:]+):([^'"]+)['"]`),
	}
	
	content := string(data)
	for _, re := range patterns {
		matches := re.FindAllStringSubmatch(content, -1)
		for _, match := range matches {
			if len(match) >= 4 {
				deps = append(deps, Dependency{
					Name:           fmt.Sprintf("%s:%s", match[1], match[2]),
					Version:        match[3],
					Ecosystem:      "Maven",
					PackageManager: "gradle",
					FilePath:       gradlePath,
				})
			}
		}
	}
	
	return deps, nil
}
