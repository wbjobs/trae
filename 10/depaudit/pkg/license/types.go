package license

import (
	"strings"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type LicenseInfo struct {
	PackageName    string
	PackageVersion string
	LicenseName    string
	LicenseURL     string
	SPDXID         string
	Source         string
}

type LicenseIssue struct {
	Package        LicenseInfo
	ProjectLicense string
	Compatible     bool
	Reason         string
	Severity       string
}

type LicenseChecker struct {
	ProjectLicense   string
	CompatibleLicenses map[string][]string
	BlacklistLicenses []string
}

var DefaultLicenseCompat = map[string][]string{
	"MIT": {
		"MIT",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"Apache-2.0",
		"ISC",
		"Unlicense",
		"CC0-1.0",
	},
	"Apache-2.0": {
		"Apache-2.0",
		"MIT",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"ISC",
		"Unlicense",
		"CC0-1.0",
	},
	"BSD-3-Clause": {
		"BSD-3-Clause",
		"MIT",
		"BSD-2-Clause",
		"Apache-2.0",
		"ISC",
		"Unlicense",
		"CC0-1.0",
	},
	"GPL-3.0": {
		"GPL-3.0",
		"GPL-2.0",
		"LGPL-3.0",
		"MIT",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"Apache-2.0",
		"ISC",
	},
	"GPL-2.0": {
		"GPL-2.0",
		"MIT",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"ISC",
	},
}

var DefaultBlacklist = []string{
	"AGPL-3.0",
	"AGPL-2.0",
	"SSPL",
	"BUSL-1.1",
}

func NewLicenseChecker(projectLicense string) *LicenseChecker {
	if projectLicense == "" {
		projectLicense = "MIT"
	}
	
	return &LicenseChecker{
		ProjectLicense:      projectLicense,
		CompatibleLicenses:  DefaultLicenseCompat,
		BlacklistLicenses:   DefaultBlacklist,
	}
}

func (lc *LicenseChecker) NormalizeLicense(license string) string {
	license = strings.TrimSpace(license)
	license = strings.Trim(license, "\"'")
	
	normalizations := map[string]string{
		"MIT License":               "MIT",
		"MIT":                       "MIT",
		"Apache":                    "Apache-2.0",
		"Apache License":            "Apache-2.0",
		"Apache License 2.0":        "Apache-2.0",
		"Apache-2.0":                "Apache-2.0",
		"BSD":                       "BSD-3-Clause",
		"BSD 3-Clause":              "BSD-3-Clause",
		"BSD-3-Clause":              "BSD-3-Clause",
		"BSD 2-Clause":              "BSD-2-Clause",
		"BSD-2-Clause":              "BSD-2-Clause",
		"ISC":                       "ISC",
		"ISC License":               "ISC",
		"GPL":                       "GPL-3.0",
		"GPL-3":                     "GPL-3.0",
		"GPL-3.0":                   "GPL-3.0",
		"GPL-2":                     "GPL-2.0",
		"GPL-2.0":                   "GPL-2.0",
		"LGPL":                      "LGPL-3.0",
		"LGPL-3":                    "LGPL-3.0",
		"LGPL-3.0":                  "LGPL-3.0",
		"AGPL":                      "AGPL-3.0",
		"AGPL-3":                    "AGPL-3.0",
		"AGPL-3.0":                  "AGPL-3.0",
		"Unlicense":                 "Unlicense",
		"Public Domain":             "Unlicense",
		"CC0":                       "CC0-1.0",
		"CC0-1.0":                   "CC0-1.0",
	}
	
	if normalized, ok := normalizations[license]; ok {
		return normalized
	}
	
	upper := strings.ToUpper(license)
	if strings.Contains(upper, "MIT") {
		return "MIT"
	}
	if strings.Contains(upper, "APACHE") {
		if strings.Contains(upper, "2.0") || strings.Contains(upper, "V2") {
			return "Apache-2.0"
		}
		return "Apache-2.0"
	}
	if strings.Contains(upper, "BSD") {
		if strings.Contains(upper, "3") || strings.Contains(upper, "NEW") {
			return "BSD-3-Clause"
		}
		if strings.Contains(upper, "2") || strings.Contains(upper, "SIMPLE") {
			return "BSD-2-Clause"
		}
		return "BSD-3-Clause"
	}
	if strings.Contains(upper, "GPL") {
		if strings.Contains(upper, "AGPL") {
			return "AGPL-3.0"
		}
		if strings.Contains(upper, "3") {
			return "GPL-3.0"
		}
		if strings.Contains(upper, "2") {
			return "GPL-2.0"
		}
		return "GPL-3.0"
	}
	
	return license
}

func (lc *LicenseChecker) IsBlacklisted(license string) bool {
	normalized := lc.NormalizeLicense(license)
	for _, b := range lc.BlacklistLicenses {
		if normalized == b {
			return true
		}
	}
	return false
}

func (lc *LicenseChecker) IsCompatible(depLicense string) (bool, string) {
	normalized := lc.NormalizeLicense(depLicense)
	
	if lc.IsBlacklisted(normalized) {
		return false, "License is in blacklist (copyleft/restrictive license)"
	}
	
	projectLicenses := strings.Split(lc.ProjectLicense, " OR ")
	if len(projectLicenses) == 0 {
		projectLicenses = []string{lc.ProjectLicense}
	}
	
	for _, projLicense := range projectLicenses {
		projLicense = lc.NormalizeLicense(projLicense)
		
		if projLicense == normalized {
			return true, ""
		}
		
		if compatList, ok := lc.CompatibleLicenses[projLicense]; ok {
			for _, c := range compatList {
				if c == normalized {
					return true, ""
				}
			}
		}
	}
	
	return false, "License may not be compatible with project license"
}

func (lc *LicenseChecker) CheckDependency(dep scanner.Dependency, licenseInfo LicenseInfo) LicenseIssue {
	compatible, reason := lc.IsCompatible(licenseInfo.LicenseName)
	
	severity := "LOW"
	if lc.IsBlacklisted(licenseInfo.LicenseName) {
		severity = "CRITICAL"
	} else if !compatible {
		severity = "MEDIUM"
	}
	
	return LicenseIssue{
		Package:        licenseInfo,
		ProjectLicense: lc.ProjectLicense,
		Compatible:     compatible,
		Reason:         reason,
		Severity:       severity,
	}
}
