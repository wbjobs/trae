package scanner

import "time"

type Dependency struct {
	Name            string
	Version         string
	Ecosystem       string
	PackageManager  string
	FilePath        string
}

type ScanResult struct {
	ProjectPath  string
	Dependencies []Dependency
	ScanTime     time.Time
	Language     string
}
