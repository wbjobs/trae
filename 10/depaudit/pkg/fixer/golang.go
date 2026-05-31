package fixer

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type GoModFixer struct{}

func (f *GoModFixer) Name() string { return "gomod" }

func (f *GoModFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "gomod"
}

func (f *GoModFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"go.mod", "go.sum"}
	for _, file := range filesToBackup {
		src := filepath.Join(path, file)
		if _, err := os.Stat(src); err == nil {
			dst := filepath.Join(backupDir, file+".bak")
			if err := copyFile(src, dst); err != nil {
				return "", err
			}
		}
	}
	
	return backupDir, nil
}

func (f *GoModFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	if dryRun {
		return nil
	}
	
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s@v%s", dep.Name, targetVersion)
	} else {
		pkgSpec = fmt.Sprintf("%s@latest", dep.Name)
	}
	
	args := []string{"get", pkgSpec}
	
	cmd := exec.Command("go", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *GoModFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"go.mod", "go.sum"}
	
	for _, file := range filesToRestore {
		src := filepath.Join(backupDir, file+".bak")
		if _, err := os.Stat(src); err != nil {
			continue
		}
		
		dst := filepath.Join(path, file)
		if err := copyFile(src, dst); err != nil {
			return err
		}
	}
	
	return nil
}

func (f *GoModFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s@v%s", dep.Name, targetVersion)
	} else {
		pkgSpec = fmt.Sprintf("%s@latest", dep.Name)
	}
	return fmt.Sprintf("go get %s", pkgSpec)
}
