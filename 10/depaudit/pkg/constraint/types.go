package constraint

import (
	"fmt"
	"strings"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type VersionConstraint struct {
	PackageName    string
	RequiredRange  string
	CurrentVersion string
}

type ConstraintIssue struct {
	PackageName    string
	CurrentVersion string
	RequiredRange  string
	Satisfied      bool
	Reason         string
	Severity       string
	ConstraintType string
}

type ConstraintChecker struct{}

func NewConstraintChecker() *ConstraintChecker {
	return &ConstraintChecker{}
}

func (cc *ConstraintChecker) Check(constraint VersionConstraint) ConstraintIssue {
	satisfied := false
	reason := ""
	
	switch {
	case strings.Contains(constraint.RequiredRange, "||") || strings.Contains(constraint.RequiredRange, " or "):
		satisfied = cc.checkORConstraint(constraint)
	case strings.Contains(constraint.RequiredRange, " - "):
		satisfied = cc.checkRangeConstraint(constraint)
	case strings.Contains(constraint.RequiredRange, "x") || strings.Contains(constraint.RequiredRange, "X") || strings.Contains(constraint.RequiredRange, "*"):
		satisfied = cc.checkWildcardConstraint(constraint)
	default:
		satisfied = cc.checkSimpleConstraint(constraint)
	}
	
	severity := "LOW"
	if !satisfied {
		severity = "MEDIUM"
		reason = fmt.Sprintf("Version %s does not satisfy constraint %s", 
			constraint.CurrentVersion, constraint.RequiredRange)
	}
	
	return ConstraintIssue{
		PackageName:    constraint.PackageName,
		CurrentVersion: constraint.CurrentVersion,
		RequiredRange:  constraint.RequiredRange,
		Satisfied:      satisfied,
		Reason:         reason,
		Severity:       severity,
	}
}

func (cc *ConstraintChecker) checkSimpleConstraint(constraint VersionConstraint) bool {
	constraints := splitConstraints(constraint.RequiredRange)
	current := constraint.CurrentVersion
	
	for _, c := range constraints {
		if !cc.singleConstraintSatisfied(c, current) {
			return false
		}
	}
	
	return true
}

func (cc *ConstraintChecker) checkORConstraint(constraint VersionConstraint) bool {
	var ranges []string
	
	if strings.Contains(constraint.RequiredRange, "||") {
		ranges = strings.Split(constraint.RequiredRange, "||")
	} else {
		ranges = strings.Split(strings.ToLower(constraint.RequiredRange), "or")
	}
	
	current := constraint.CurrentVersion
	
	for _, r := range ranges {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		
		if cc.checkSimpleConstraint(VersionConstraint{
			PackageName:    constraint.PackageName,
			CurrentVersion: current,
			RequiredRange:  r,
		}) {
			return true
		}
	}
	
	return false
}

func (cc *ConstraintChecker) checkRangeConstraint(constraint VersionConstraint) bool {
	parts := strings.Split(constraint.RequiredRange, " - ")
	if len(parts) != 2 {
		return false
	}
	
	lower := strings.TrimSpace(parts[0])
	upper := strings.TrimSpace(parts[1])
	current := constraint.CurrentVersion
	
	return cc.versionCompare(current, ">=", lower) && cc.versionCompare(current, "<=", upper)
}

func (cc *ConstraintChecker) checkWildcardConstraint(constraint VersionConstraint) bool {
	pattern := constraint.RequiredRange
	current := constraint.CurrentVersion
	
	pattern = strings.ReplaceAll(pattern, ".x", ".*")
	pattern = strings.ReplaceAll(pattern, ".X", ".*")
	pattern = strings.ReplaceAll(pattern, "*", ".*")
	
	patternParts := strings.Split(pattern, ".")
	currentParts := strings.Split(current, ".")
	
	for i, p := range patternParts {
		if p == ".*" || p == "*" {
			return true
		}
		if i >= len(currentParts) {
			return false
		}
		if patternParts[i] != currentParts[i] {
			return false
		}
	}
	
	return true
}

func splitConstraints(constraint string) []string {
	var result []string
	var current strings.Builder
	
	i := 0
	for i < len(constraint) {
		if constraint[i] == ' ' && i+1 < len(constraint) {
			nextChar := constraint[i+1]
			if nextChar == '>' || nextChar == '<' || nextChar == '=' || nextChar == '~' || nextChar == '^' {
				result = append(result, strings.TrimSpace(current.String()))
				current.Reset()
				i++
				continue
			}
		}
		current.WriteByte(constraint[i])
		i++
	}
	
	if current.Len() > 0 {
		result = append(result, strings.TrimSpace(current.String()))
	}
	
	return result
}

func (cc *ConstraintChecker) singleConstraintSatisfied(constraint, version string) bool {
	var op string
	var ver string
	
	if strings.HasPrefix(constraint, ">=") {
		op = ">="
		ver = strings.TrimPrefix(constraint, ">=")
	} else if strings.HasPrefix(constraint, "<=") {
		op = "<="
		ver = strings.TrimPrefix(constraint, "<=")
	} else if strings.HasPrefix(constraint, ">") {
		op = ">"
		ver = strings.TrimPrefix(constraint, ">")
	} else if strings.HasPrefix(constraint, "<") {
		op = "<"
		ver = strings.TrimPrefix(constraint, "<")
	} else if strings.HasPrefix(constraint, "==") {
		op = "=="
		ver = strings.TrimPrefix(constraint, "==")
	} else if strings.HasPrefix(constraint, "!=") {
		op = "!="
		ver = strings.TrimPrefix(constraint, "!=")
	} else if strings.HasPrefix(constraint, "~=") {
		op = "~="
		ver = strings.TrimPrefix(constraint, "~=")
	} else if strings.HasPrefix(constraint, "~") {
		op = "~"
		ver = strings.TrimPrefix(constraint, "~")
	} else if strings.HasPrefix(constraint, "^") {
		op = "^"
		ver = strings.TrimPrefix(constraint, "^")
	} else if strings.HasPrefix(constraint, "=") {
		op = "=="
		ver = strings.TrimPrefix(constraint, "=")
	} else {
		op = "=="
		ver = constraint
	}
	
	ver = strings.TrimSpace(ver)
	return cc.versionCompare(version, op, ver)
}

func (cc *ConstraintChecker) versionCompare(version1, op, version2 string) bool {
	v1 := parseVersion(version1)
	v2 := parseVersion(version2)
	
	v1 = padVersion(v1, len(v2))
	v2 = padVersion(v2, len(v1))
	
	var cmp int
	for i := 0; i < len(v1); i++ {
		if v1[i] > v2[i] {
			cmp = 1
			break
		} else if v1[i] < v2[i] {
			cmp = -1
			break
		}
	}
	
	switch op {
	case "==", "=":
		return cmp == 0
	case "!=":
		return cmp != 0
	case ">":
		return cmp > 0
	case ">=":
		return cmp >= 0
	case "<":
		return cmp < 0
	case "<=":
		return cmp <= 0
	case "~", "~=":
		return cc.checkTildeConstraint(v1, v2)
	case "^":
		return cc.checkCaretConstraint(v1, v2)
	default:
		return cmp == 0
	}
}

func parseVersion(version string) []int {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	version = strings.TrimPrefix(version, "V")
	
	if idx := strings.IndexAny(version, "-+"); idx > -1 {
		version = version[:idx]
	}
	
	parts := strings.Split(version, ".")
	result := make([]int, 0, len(parts))
	
	for _, p := range parts {
		var num int
		fmt.Sscanf(p, "%d", &num)
		result = append(result, num)
	}
	
	return result
}

func padVersion(version []int, targetLen int) []int {
	if len(version) >= targetLen {
		return version
	}
	
	padded := make([]int, targetLen)
	copy(padded, version)
	return padded
}

func (cc *ConstraintChecker) checkTildeConstraint(current, required []int) bool {
	if len(required) == 0 {
		return true
	}
	
	if len(current) < len(required) {
		return false
	}
	
	for i := 0; i < len(required)-1; i++ {
		if current[i] != required[i] {
			return false
		}
	}
	
	if len(required) > 1 {
		lastIdx := len(required) - 1
		return current[lastIdx] >= required[lastIdx]
	}
	
	return true
}

func (cc *ConstraintChecker) checkCaretConstraint(current, required []int) bool {
	if len(required) == 0 {
		return true
	}
	
	if len(current) < len(required) {
		return false
	}
	
	if required[0] > 0 {
		if current[0] != required[0] {
			return false
		}
		for i := 1; i < len(required); i++ {
			if current[i] < required[i] {
				return false
			}
		}
		return true
	}
	
	if len(required) > 1 && required[1] > 0 {
		if current[0] != 0 || current[1] != required[1] {
			return false
		}
		for i := 2; i < len(required); i++ {
			if current[i] < required[i] {
				return false
			}
		}
		return true
	}
	
	for i := 0; i < len(required); i++ {
		if current[i] != required[i] {
			return false
		}
	}
	return true
}
