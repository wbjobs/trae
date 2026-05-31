package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Scan       ScanConfig      `yaml:"scan"`
	Vuln       VulnConfig      `yaml:"vulnerability"`
	License    LicenseConfig   `yaml:"license"`
	Constraint ConstraintConfig `yaml:"constraint"`
	Fix        FixConfig       `yaml:"fix"`
	Report     ReportConfig    `yaml:"report"`
	CI         CIConfig        `yaml:"ci"`
}

type ScanConfig struct {
	Paths       []string `yaml:"paths"`
	Languages   []string `yaml:"languages"`
	ExcludeDirs []string `yaml:"exclude_dirs"`
	IncludeDev  bool     `yaml:"include_dev"`
}

type VulnConfig struct {
	MinSeverity    string            `yaml:"min_severity"`
	IgnoreIDs      []string          `yaml:"ignore_ids"`
	IgnorePackages map[string]string `yaml:"ignore_packages"`
	DataSources    []string          `yaml:"data_sources"`
}

type FixConfig struct {
	Enabled        bool     `yaml:"enabled"`
	AutoRollback   bool     `yaml:"auto_rollback"`
	DryRun         bool     `yaml:"dry_run"`
	MaxUpdates     int      `yaml:"max_updates"`
	ExcludePackages []string `yaml:"exclude_packages"`
}

type ReportConfig struct {
	Formats []string `yaml:"formats"`
	OutputDir string  `yaml:"output_dir"`
	IncludeDetails bool `yaml:"include_details"`
}

type LicenseConfig struct {
	Enabled          bool     `yaml:"enabled"`
	ProjectLicense  string   `yaml:"project_license"`
	BlacklistLicenses []string `yaml:"blacklist_licenses"`
	IgnorePackages []string   `yaml:"ignore_packages"`
	CheckUnknown   bool     `yaml:"check_unknown"`
}

type ConstraintConfig struct {
	Enabled        bool     `yaml:"enabled"`
	CheckPeers     bool     `yaml:"check_peer_dependencies"`
	IgnorePackages []string `yaml:"ignore_packages"`
}

type CIConfig struct {
	Enabled         bool   `yaml:"enabled"`
	FailOnVuln      bool   `yaml:"fail_on_vulnerability"`
	MinSeverity     string `yaml:"min_severity"`
	CreateArtifact  bool   `yaml:"create_artifact"`
	FailOnLicense   bool   `yaml:"fail_on_license_issue"`
	FailOnConstraint bool  `yaml:"fail_on_constraint_issue"`
}

func LoadConfig(path string) (*Config, error) {
	if path == "" {
		path = findConfigFile()
	}
	
	if path == "" {
		return DefaultConfig(), nil
	}
	
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	
	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	
	config.applyDefaults()
	
	return &config, nil
}

func findConfigFile() string {
	locations := []string{
		".depaudit.yaml",
		".depaudit.yml",
		"depaudit.yaml",
		"depaudit.yml",
	}
	
	for _, loc := range locations {
		if _, err := os.Stat(loc); err == nil {
			return loc
		}
	}
	
	return ""
}

func DefaultConfig() *Config {
	return &Config{
		Scan: ScanConfig{
			Paths:       []string{"."},
			Languages:   []string{"javascript", "python", "java", "golang"},
			ExcludeDirs: []string{"node_modules", "vendor", "dist", "build"},
			IncludeDev:  true,
		},
		Vuln: VulnConfig{
			MinSeverity:    "LOW",
			IgnoreIDs:      []string{},
			IgnorePackages: map[string]string{},
			DataSources:    []string{"osv"},
		},
		License: LicenseConfig{
			Enabled:          true,
			ProjectLicense:  "",
			BlacklistLicenses: []string{"AGPL-3.0", "AGPL-2.0", "SSPL"},
			IgnorePackages: []string{},
			CheckUnknown:   false,
		},
		Constraint: ConstraintConfig{
			Enabled:        true,
			CheckPeers:     true,
			IgnorePackages: []string{},
		},
		Fix: FixConfig{
			Enabled:        false,
			AutoRollback:   true,
			DryRun:         false,
			MaxUpdates:     10,
			ExcludePackages: []string{},
		},
		Report: ReportConfig{
			Formats:      []string{"text"},
			OutputDir:    ".",
			IncludeDetails: true,
		},
		CI: CIConfig{
			Enabled:        false,
			FailOnVuln:     true,
			MinSeverity:    "HIGH",
			CreateArtifact: true,
			FailOnLicense:  false,
			FailOnConstraint: false,
		},
	}
}

func (c *Config) applyDefaults() {
	defaults := DefaultConfig()
	
	if len(c.Scan.Paths) == 0 {
		c.Scan.Paths = defaults.Scan.Paths
	}
	if len(c.Scan.Languages) == 0 {
		c.Scan.Languages = defaults.Scan.Languages
	}
	if len(c.Scan.ExcludeDirs) == 0 {
		c.Scan.ExcludeDirs = defaults.Scan.ExcludeDirs
	}
	if c.Vuln.MinSeverity == "" {
		c.Vuln.MinSeverity = defaults.Vuln.MinSeverity
	}
	if len(c.Vuln.DataSources) == 0 {
		c.Vuln.DataSources = defaults.Vuln.DataSources
	}
	if len(c.Report.Formats) == 0 {
		c.Report.Formats = defaults.Report.Formats
	}
	if c.Report.OutputDir == "" {
		c.Report.OutputDir = defaults.Report.OutputDir
	}
}

func (c *Config) Save(path string) error {
	data, err := yaml.Marshal(c)
	if err != nil {
		return err
	}
	
	dir := filepath.Dir(path)
	if dir != "" {
		os.MkdirAll(dir, 0755)
	}
	
	return os.WriteFile(path, data, 0644)
}

func (c *Config) ShouldIgnoreVuln(vulnID string) bool {
	for _, id := range c.Vuln.IgnoreIDs {
		if id == vulnID {
			return true
		}
	}
	return false
}

func (c *Config) ShouldIgnorePackage(name, version string) bool {
	for pkg, ver := range c.Vuln.IgnorePackages {
		if pkg == name {
			if ver == "" || ver == version {
				return true
			}
		}
	}
	return false
}

func (c *Config) IsSeverityAllowed(severity string) bool {
	order := map[string]int{
		"CRITICAL": 4,
		"HIGH":     3,
		"MEDIUM":   2,
		"LOW":      1,
	}
	
	minLevel := order[c.Vuln.MinSeverity]
	currentLevel := order[severity]
	
	return currentLevel >= minLevel
}

func (c *Config) Validate() error {
	validSeverities := map[string]bool{
		"CRITICAL": true,
		"HIGH":     true,
		"MEDIUM":   true,
		"LOW":      true,
	}
	
	if !validSeverities[c.Vuln.MinSeverity] {
		return fmt.Errorf("invalid min_severity: %s", c.Vuln.MinSeverity)
	}
	
	validFormats := map[string]bool{
		"text": true,
		"json": true,
		"html": true,
	}
	
	for _, format := range c.Report.Formats {
		if !validFormats[format] {
			return fmt.Errorf("invalid report format: %s", format)
		}
	}
	
	return nil
}
