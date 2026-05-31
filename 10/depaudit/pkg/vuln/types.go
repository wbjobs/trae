package vuln

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type Vulnerability struct {
	ID               string
	Severity         string
	Description      string
	CVSS             float64
	PublishedDate    time.Time
	FixedVersions    []string
	AffectedVersions string
	References       []string
	Suggestion       string
	Ecosystem        string
	PackageName      string
	Version          string
	Dependency       scanner.Dependency
}

type VulnerabilityChecker interface {
	Query(pkgName, version, ecosystem string) ([]Vulnerability, error)
}

type Checker struct {
	checkers []VulnerabilityChecker
}

func NewChecker() *Checker {
	return &Checker{
		checkers: []VulnerabilityChecker{
			NewOSVClient(),
		},
	}
}

func (c *Checker) CheckDependency(dep scanner.Dependency) ([]Vulnerability, error) {
	var allVulns []Vulnerability
	
	for _, checker := range c.checkers {
		vulns, err := checker.Query(dep.Name, dep.Version, dep.Ecosystem)
		if err != nil {
			continue
		}
		for i := range vulns {
			vulns[i].Dependency = dep
		}
		allVulns = append(allVulns, vulns...)
	}
	
	return allVulns, nil
}

func (c *Checker) CheckDependencies(deps []scanner.Dependency) []Vulnerability {
	var allVulns []Vulnerability
	
	for _, dep := range deps {
		vulns, err := c.CheckDependency(dep)
		if err != nil {
			continue
		}
		allVulns = append(allVulns, vulns...)
	}
	
	return allVulns
}

func parseCVSSScore(scoreStr string) float64 {
	if scoreStr == "" {
		return 0
	}
	
	parts := strings.Split(scoreStr, "/")
	for _, part := range parts {
		if strings.HasPrefix(part, "SCORE:") {
			scoreVal := strings.TrimPrefix(part, "SCORE:")
			score, err := strconv.ParseFloat(scoreVal, 64)
			if err == nil {
				return score
			}
		}
	}
	
	score, err := strconv.ParseFloat(scoreStr, 64)
	if err == nil {
		return score
	}
	
	return 0
}

func getSeverityLevel(score float64) string {
	switch {
	case score >= 9.0:
		return "CRITICAL"
	case score >= 7.0:
		return "HIGH"
	case score >= 4.0:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func (v Vulnerability) String() string {
	return fmt.Sprintf("[%s] %s - %s (CVSS: %.1f)", v.Severity, v.ID, v.PackageName, v.CVSS)
}
