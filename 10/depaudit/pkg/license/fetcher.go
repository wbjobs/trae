package license

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type LicenseFetcher struct {
	client *http.Client
}

func NewLicenseFetcher() *LicenseFetcher {
	return &LicenseFetcher{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type LicenseResult struct {
	LicenseInfo LicenseInfo
	Error       error
	Found       bool
}

func (f *LicenseFetcher) Fetch(dep scanner.Dependency) LicenseResult {
	switch dep.Ecosystem {
	case "npm":
		return f.fetchNPMLicense(dep)
	case "PyPI":
		return f.fetchPyPILicense(dep)
	case "Maven":
		return f.fetchMavenLicense(dep)
	case "Go":
		return f.fetchGoLicense(dep)
	default:
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "unknown",
			},
			Found: false,
			Error: fmt.Errorf("unsupported ecosystem: %s", dep.Ecosystem),
		}
	}
}

func (f *LicenseFetcher) fetchNPMLicense(dep scanner.Dependency) LicenseResult {
	version := dep.Version
	if version == "" || version == "*" {
		version = "latest"
	}
	
	url := fmt.Sprintf("https://registry.npmjs.org/%s/%s", dep.Name, version)
	
	resp, err := f.client.Get(url)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "npm",
			},
			Found: false,
			Error: err,
		}
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "npm",
			},
			Found: false,
			Error: fmt.Errorf("npm registry returned status: %d", resp.StatusCode),
		}
	}
	
	var data map[string]interface{}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "npm",
			},
			Found: false,
			Error: err,
		}
	}
	
	if err := json.Unmarshal(body, &data); err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "npm",
			},
			Found: false,
			Error: err,
		}
	}
	
	licenseName := "UNKNOWN"
	if l, ok := data["license"]; ok {
		switch v := l.(type) {
		case string:
			licenseName = v
		case map[string]interface{}:
			if t, ok := v["type"]; ok {
				if ts, ok := t.(string); ok {
					licenseName = ts
				}
			}
		}
	}
	
	return LicenseResult{
		LicenseInfo: LicenseInfo{
			PackageName:    dep.Name,
			PackageVersion: dep.Version,
			LicenseName:    licenseName,
			Source:         "npm",
		},
		Found: licenseName != "UNKNOWN",
		Error: nil,
	}
}

func (f *LicenseFetcher) fetchPyPILicense(dep scanner.Dependency) LicenseResult {
	url := fmt.Sprintf("https://pypi.org/pypi/%s/json", dep.Name)
	
	resp, err := f.client.Get(url)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "pypi",
			},
			Found: false,
			Error: err,
		}
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "pypi",
			},
			Found: false,
			Error: fmt.Errorf("PyPI returned status: %d", resp.StatusCode),
		}
	}
	
	var data map[string]interface{}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "pypi",
			},
			Found: false,
			Error: err,
		}
	}
	
	if err := json.Unmarshal(body, &data); err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "pypi",
			},
			Found: false,
			Error: err,
		}
	}
	
	licenseName := "UNKNOWN"
	
	if info, ok := data["info"]; ok {
		if infoMap, ok := info.(map[string]interface{}); ok {
			if license, ok := infoMap["license"]; ok {
				if licenseStr, ok := license.(string); ok {
					licenseName = licenseStr
				}
			}
		}
	}
	
	if licenseName == "" {
		licenseName = "UNKNOWN"
	}
	
	classifiers := []string{}
	if info, ok := data["info"]; ok {
		if infoMap, ok := info.(map[string]interface{}); ok {
			if cls, ok := infoMap["classifiers"]; ok {
				if clist, ok := cls.([]interface{}); ok {
					for _, c := range clist {
						if cs, ok := c.(string); ok {
							classifiers = append(classifiers, cs)
						}
					}
				}
			}
		}
	}
	
	if licenseName == "UNKNOWN" {
		for _, c := range classifiers {
			if strings.HasPrefix(c, "License :: ") {
				parts := strings.Split(c, " :: ")
				if len(parts) >= 3 {
					licenseName = parts[2]
					break
				}
			}
		}
	}
	
	return LicenseResult{
		LicenseInfo: LicenseInfo{
			PackageName:    dep.Name,
			PackageVersion: dep.Version,
			LicenseName:    licenseName,
			Source:         "pypi",
		},
		Found: licenseName != "UNKNOWN",
		Error: nil,
	}
}

func (f *LicenseFetcher) fetchMavenLicense(dep scanner.Dependency) LicenseResult {
	parts := strings.SplitN(dep.Name, ":", 2)
	if len(parts) != 2 {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "maven",
			},
			Found: false,
			Error: fmt.Errorf("invalid maven package name: %s", dep.Name),
		}
	}
	
	groupId := strings.ReplaceAll(parts[0], ".", "/")
	artifactId := parts[1]
	version := dep.Version
	if version == "" {
		version = "RELEASE"
	}
	
	baseURL := fmt.Sprintf("https://repo1.maven.org/maven2/%s/%s/%s/%s-%s.pom",
		groupId, artifactId, version, artifactId, version)
	
	resp, err := f.client.Get(baseURL)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "maven",
			},
			Found: false,
			Error: err,
		}
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "maven",
			},
			Found: false,
			Error: fmt.Errorf("Maven returned status: %d", resp.StatusCode),
		}
	}
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return LicenseResult{
			LicenseInfo: LicenseInfo{
				PackageName:    dep.Name,
				PackageVersion: dep.Version,
				LicenseName:    "UNKNOWN",
				Source:         "maven",
			},
			Found: false,
			Error: err,
		}
	}
	
	licenseName := "UNKNOWN"
	content := string(body)
	
	nameStart := strings.Index(content, "<name>")
	nameEnd := strings.Index(content, "</name>")
	urlStart := strings.Index(content, "<url>")
	urlEnd := strings.Index(content, "</url>")
	
	if nameStart > -1 && nameEnd > nameStart {
		licenseName = strings.TrimSpace(content[nameStart+6 : nameEnd])
	}
	
	licenseURL := ""
	if urlStart > -1 && urlEnd > urlStart {
		licenseURL = strings.TrimSpace(content[urlStart+5 : urlEnd])
	}
	
	return LicenseResult{
		LicenseInfo: LicenseInfo{
			PackageName:    dep.Name,
			PackageVersion: dep.Version,
			LicenseName:    licenseName,
			LicenseURL:     licenseURL,
			Source:         "maven",
		},
		Found: licenseName != "UNKNOWN",
		Error: nil,
	}
}

func (f *LicenseFetcher) fetchGoLicense(dep scanner.Dependency) LicenseResult {
	module := dep.Name
	version := dep.Version
	
	pkgPath := module
	if strings.HasPrefix(module, "github.com/") {
		parts := strings.Split(module, "/")
		if len(parts) >= 3 {
			owner := parts[1]
			repo := parts[2]
			licenseURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/license", owner, repo)
			
			req, err := http.NewRequest("GET", licenseURL, nil)
			if err == nil {
				req.Header.Set("Accept", "application/vnd.github.drax-preview+json")
				
				resp, err := f.client.Do(req)
				if err == nil && resp.StatusCode == http.StatusOK {
					defer resp.Body.Close()
					
					var data map[string]interface{}
					body, _ := io.ReadAll(resp.Body)
					if json.Unmarshal(body, &data) == nil {
						if license, ok := data["license"]; ok {
							if licenseMap, ok := license.(map[string]interface{}); ok {
								if key, ok := licenseMap["key"]; ok {
									if keyStr, ok := key.(string); ok {
										return LicenseResult{
											LicenseInfo: LicenseInfo{
												PackageName:    module,
												PackageVersion: version,
												LicenseName:    strings.ToUpper(keyStr),
												SPDXID:         strings.ToUpper(keyStr),
												Source:         "github",
											},
											Found: true,
											Error: nil,
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	
	return LicenseResult{
		LicenseInfo: LicenseInfo{
			PackageName:    module,
			PackageVersion: version,
			LicenseName:    "UNKNOWN",
			Source:         "go",
		},
		Found: false,
		Error: nil,
	}
}

func GetProjectLicense(projectPath string) string {
	licenseFiles := []string{
		"LICENSE",
		"LICENSE.md",
		"LICENSE.txt",
		"LICENCE",
		"LICENCE.md",
		"COPYING",
		"COPYING.md",
	}
	
	for _, file := range licenseFiles {
		licensePath := filepath.Join(projectPath, file)
		if data, err := os.ReadFile(licensePath); err == nil {
			return detectLicenseFromContent(string(data))
		}
	}
	
	pkgJSON := filepath.Join(projectPath, "package.json")
	if data, err := os.ReadFile(pkgJSON); err == nil {
		var pkg map[string]interface{}
		if json.Unmarshal(data, &pkg) == nil {
			if license, ok := pkg["license"]; ok {
				if licenseStr, ok := license.(string); ok {
					return licenseStr
				}
			}
		}
	}
	
	pyproject := filepath.Join(projectPath, "pyproject.toml")
	if data, err := os.ReadFile(pyproject); err == nil {
		content := string(data)
		if strings.Contains(content, "license") {
			idx := strings.Index(content, "license")
			if idx > -1 {
				remain := content[idx:]
				quotes := []string{`"`, "'"}
				for _, q := range quotes {
					qStart := strings.Index(remain, q)
					if qStart > -1 {
						qEnd := strings.Index(remain[qStart+1:], q)
						if qEnd > -1 {
							return strings.TrimSpace(remain[qStart+1 : qStart+1+qEnd])
						}
					}
				}
			}
		}
	}
	
	return "MIT"
}

func detectLicenseFromContent(content string) string {
	content = strings.ToLower(content)
	
	if strings.Contains(content, "mit license") || strings.Contains(content, "the mit license") {
		return "MIT"
	}
	if strings.Contains(content, "apache") && strings.Contains(content, "version 2.0") {
		return "Apache-2.0"
	}
	if strings.Contains(content, "gnu general public license") {
		if strings.Contains(content, "version 3") {
			return "GPL-3.0"
		}
		return "GPL-2.0"
	}
	if strings.Contains(content, "gnu lesser general public license") {
		return "LGPL-3.0"
	}
	if strings.Contains(content, "gnu affero general public license") {
		return "AGPL-3.0"
	}
	if strings.Contains(content, "bsd") {
		if strings.Contains(content, "3-clause") || strings.Contains(content, "new bsd") {
			return "BSD-3-Clause"
		}
		if strings.Contains(content, "2-clause") || strings.Contains(content, "simplified bsd") {
			return "BSD-2-Clause"
		}
		return "BSD-3-Clause"
	}
	if strings.Contains(content, "mozilla public license") {
		return "MPL-2.0"
	}
	
	return "MIT"
}
