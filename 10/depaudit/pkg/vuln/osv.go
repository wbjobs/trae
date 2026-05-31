package vuln

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const OSVAPI = "https://api.osv.dev/v1/query"

type OSVRequest struct {
	Package  OSVPackage `json:"package"`
	Version  string     `json:"version"`
}

type OSVPackage struct {
	Name      string `json:"name"`
	Ecosystem string `json:"ecosystem"`
}

type OSVResponse struct {
	Vulns []OSVVulnerability `json:"vulns"`
}

type OSVVulnerability struct {
	ID               string   `json:"id"`
	Published        string   `json:"published"`
	Modified         string   `json:"modified"`
	Aliases          []string `json:"aliases"`
	Summary          string   `json:"summary"`
	Details          string   `json:"details"`
	Affected         []OSVAffected `json:"affected"`
	References       []OSVReference `json:"references"`
	Severity         []OSVSeverity  `json:"severity"`
}

type OSVAffected struct {
	Package OSVPackage `json:"package"`
	Ranges  []OSVRange `json:"ranges"`
	Versions []string  `json:"versions"`
}

type OSVRange struct {
	Type   string       `json:"type"`
	Events []OSVEvent   `json:"events"`
}

type OSVEvent struct {
	Introduced string `json:"introduced"`
	Fixed      string `json:"fixed"`
}

type OSVReference struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type OSVSeverity struct {
	Type  string `json:"type"`
	Score string `json:"score"`
}

type OSVClient struct {
	client *http.Client
}

func NewOSVClient() *OSVClient {
	return &OSVClient{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *OSVClient) Query(pkgName, version, ecosystem string) ([]Vulnerability, error) {
	req := OSVRequest{
		Package: OSVPackage{
			Name:      pkgName,
			Ecosystem: mapEcosystem(ecosystem),
		},
		Version: version,
	}
	
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	
	resp, err := c.client.Post(OSVAPI, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OSV API returned status: %d", resp.StatusCode)
	}
	
	var osvResp OSVResponse
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	if err := json.Unmarshal(data, &osvResp); err != nil {
		return nil, err
	}
	
	var vulns []Vulnerability
	for _, osv := range osvResp.Vulns {
		vuln := c.convertToVulnerability(osv, pkgName, version, ecosystem)
		vulns = append(vulns, vuln)
	}
	
	return vulns, nil
}

func (c *OSVClient) convertToVulnerability(osv OSVVulnerability, pkgName, version, ecosystem string) Vulnerability {
	severity := "MEDIUM"
	cvss := 5.0
	
	if len(osv.Severity) > 0 {
		for _, sev := range osv.Severity {
			if sev.Type == "CVSS_V3" {
				score := parseCVSSScore(sev.Score)
				if score > 0 {
					cvss = score
					severity = getSeverityLevel(score)
				}
			}
		}
	}
	
	published, _ := time.Parse(time.RFC3339, osv.Published)
	
	var fixedVersions []string
	var suggestion string
	
	for _, affected := range osv.Affected {
		for _, r := range affected.Ranges {
			for _, event := range r.Events {
				if event.Fixed != "" {
					fixedVersions = append(fixedVersions, event.Fixed)
					if suggestion == "" {
						suggestion = fmt.Sprintf("Upgrade to version %s or later", event.Fixed)
					}
				}
			}
		}
	}
	
	var refs []string
	for _, ref := range osv.References {
		refs = append(refs, ref.URL)
	}
	
	id := osv.ID
	for _, alias := range osv.Aliases {
		if len(alias) > 0 && alias[0] == 'C' {
			id = alias
			break
		}
	}
	
	description := osv.Details
	if description == "" {
		description = osv.Summary
	}
	
	return Vulnerability{
		ID:               id,
		Severity:         severity,
		Description:      description,
		CVSS:             cvss,
		PublishedDate:    published,
		FixedVersions:    fixedVersions,
		AffectedVersions: version,
		References:       refs,
		Suggestion:       suggestion,
		Ecosystem:        ecosystem,
		PackageName:      pkgName,
		Version:          version,
	}
}

func mapEcosystem(ecosystem string) string {
	mapping := map[string]string{
		"npm":    "npm",
		"PyPI":   "PyPI",
		"Maven":  "Maven",
		"Go":     "Go",
	}
	
	if mapped, ok := mapping[ecosystem]; ok {
		return mapped
	}
	return ecosystem
}
