package constraint

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

type PeerDependency struct {
	PackageName   string
	VersionRange  string
}

type ConstraintParser struct{}

func NewConstraintParser() *ConstraintParser {
	return &ConstraintParser{}
}

func (p *ConstraintParser) ParseProject(projectPath string) ([]PeerDependency, error) {
	var allDeps []PeerDependency
	
	if deps, err := p.parsePackageJSON(projectPath); err == nil {
		allDeps = append(allDeps, deps...)
	}
	
	if deps, err := p.parsePyproject(projectPath); err == nil {
		allDeps = append(allDeps, deps...)
	}
	
	if deps, err := p.parseGoMod(projectPath); err == nil {
		allDeps = append(allDeps, deps...)
	}
	
	if deps, err := p.parsePomXML(projectPath); err == nil {
		allDeps = append(allDeps, deps...)
	}
	
	return allDeps, nil
}

type PackageJSONPeer struct {
	PeerDependencies    map[string]string `json:"peerDependencies"`
	PeerDependenciesMeta map[string]struct {
		Optional bool `json:"optional"`
	} `json:"peerDependenciesMeta"`
}

func (p *ConstraintParser) parsePackageJSON(projectPath string) ([]PeerDependency, error) {
	var deps []PeerDependency
	
	pkgPath := filepath.Join(projectPath, "package.json")
	if _, err := os.Stat(pkgPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		return deps, err
	}
	
	var pkg PackageJSONPeer
	if err := json.Unmarshal(data, &pkg); err != nil {
		return deps, err
	}
	
	for name, version := range pkg.PeerDependencies {
		if meta, ok := pkg.PeerDependenciesMeta[name]; ok {
			if meta.Optional {
				continue
			}
		}
		
		version = strings.Trim(version, "^~")
		deps = append(deps, PeerDependency{
			PackageName:  name,
			VersionRange: version,
		})
	}
	
	return deps, nil
}

type PyprojectSection struct {
	Name        string
	Description string
	Requires    []string
}

func (p *ConstraintParser) parsePyproject(projectPath string) ([]PeerDependency, error) {
	var deps []PeerDependency
	
	pyprojectPath := filepath.Join(projectPath, "pyproject.toml")
	if _, err := os.Stat(pyprojectPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pyprojectPath)
	if err != nil {
		return deps, err
	}
	
	content := string(data)
	
	depPatterns := []string{
		"requires-python",
		"python_requires",
	}
	
	for _, pattern := range depPatterns {
		idx := strings.Index(strings.ToLower(content), pattern)
		if idx > -1 {
			remain := content[idx:]
			quotes := []string{`"`, "'"}
			for _, q := range quotes {
				qStart := strings.Index(remain, q)
				if qStart > -1 {
					qEnd := strings.Index(remain[qStart+1:], q)
					if qEnd > -1 {
						value := strings.TrimSpace(remain[qStart+1 : qStart+1+qEnd])
						deps = append(deps, PeerDependency{
							PackageName:  "python",
							VersionRange: value,
						})
						break
					}
				}
			}
		}
	}
	
	return deps, nil
}

func (p *ConstraintParser) parseGoMod(projectPath string) ([]PeerDependency, error) {
	var deps []PeerDependency
	
	goModPath := filepath.Join(projectPath, "go.mod")
	if _, err := os.Stat(goModPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(goModPath)
	if err != nil {
		return deps, err
	}
	
	content := string(data)
	
	if idx := strings.Index(content, "go "); idx > -1 {
		remain := content[idx+3:]
		parts := strings.Fields(remain)
		if len(parts) > 0 {
			version := parts[0]
			version = strings.TrimSpace(version)
			if version != "" {
				deps = append(deps, PeerDependency{
					PackageName:  "go",
					VersionRange: version,
				})
			}
		}
	}
	
	return deps, nil
}

func (p *ConstraintParser) parsePomXML(projectPath string) ([]PeerDependency, error) {
	var deps []PeerDependency
	
	pomPath := filepath.Join(projectPath, "pom.xml")
	if _, err := os.Stat(pomPath); err != nil {
		return deps, err
	}
	
	data, err := os.ReadFile(pomPath)
	if err != nil {
		return deps, err
	}
	
	content := string(data)
	
	javaVersionTags := []string{
		"<maven.compiler.source>",
		"<maven.compiler.target>",
		"<java.version>",
		"<maven.compiler.release>",
	}
	
	for _, tag := range javaVersionTags {
		startTag := tag
		endTag := strings.Replace(tag, "<", "</", 1)
		
		startIdx := strings.Index(content, startTag)
		if startIdx > -1 {
			endIdx := strings.Index(content[startIdx:], endTag)
			if endIdx > -1 {
				versionStart := startIdx + len(startTag)
				versionEnd := startIdx + endIdx
				version := strings.TrimSpace(content[versionStart:versionEnd])
				if version != "" {
					deps = append(deps, PeerDependency{
						PackageName:  "java",
						VersionRange: version,
					})
					break
				}
			}
		}
	}
	
	return deps, nil
}
