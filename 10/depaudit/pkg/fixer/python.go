package fixer

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type PipFixer struct{}

func (f *PipFixer) Name() string { return "pip" }

func (f *PipFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "pip"
}

func (f *PipFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	reqPath := filepath.Join(path, "requirements.txt")
	if _, err := os.Stat(reqPath); err == nil {
		dst := filepath.Join(backupDir, "requirements.txt.bak")
		if err := copyFile(reqPath, dst); err != nil {
			return "", err
		}
	}
	
	return backupDir, nil
}

func (f *PipFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s==%s", dep.Name, targetVersion)
	}
	
	args := []string{"install", "--upgrade", pkgSpec}
	if dryRun {
		args = append(args, "--dry-run")
	}
	
	cmd := exec.Command("pip", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *PipFixer) Rollback(path string, backupDir string) error {
	reqPath := filepath.Join(path, "requirements.txt")
	backupPath := filepath.Join(backupDir, "requirements.txt.bak")
	
	if _, err := os.Stat(backupPath); err == nil {
		if err := copyFile(backupPath, reqPath); err != nil {
			return err
		}
	}
	
	return nil
}

func (f *PipFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s==%s", dep.Name, targetVersion)
	}
	return fmt.Sprintf("pip install --upgrade %s", pkgSpec)
}

type PipenvFixer struct{}

func (f *PipenvFixer) Name() string { return "pipenv" }

func (f *PipenvFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "pipenv"
}

func (f *PipenvFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"Pipfile", "Pipfile.lock"}
	for _, file := range filesToBackup {
		src := filepath.Join(path, file)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		
		dst := filepath.Join(backupDir, file+".bak")
		if err := copyFile(src, dst); err != nil {
			return "", err
		}
	}
	
	return backupDir, nil
}

func (f *PipenvFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s==%s", dep.Name, targetVersion)
	}
	
	args := []string{"update", pkgSpec}
	if dryRun {
		args = append(args, "--dry-run")
	}
	
	cmd := exec.Command("pipenv", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *PipenvFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"Pipfile", "Pipfile.lock"}
	
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

func (f *PipenvFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s==%s", dep.Name, targetVersion)
	}
	return fmt.Sprintf("pipenv update %s", pkgSpec)
}

type PoetryFixer struct{}

func (f *PoetryFixer) Name() string { return "poetry" }

func (f *PoetryFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "poetry"
}

func (f *PoetryFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"pyproject.toml", "poetry.lock"}
	for _, file := range filesToBackup {
		src := filepath.Join(path, file)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		
		dst := filepath.Join(backupDir, file+".bak")
		if err := copyFile(src, dst); err != nil {
			return "", err
		}
	}
	
	return backupDir, nil
}

func (f *PoetryFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s@^%s", dep.Name, targetVersion)
	}
	
	args := []string{"update", pkgSpec}
	if dryRun {
		args = append(args, "--dry-run")
	}
	
	cmd := exec.Command("poetry", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *PoetryFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"pyproject.toml", "poetry.lock"}
	
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

func (f *PoetryFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	pkgSpec := dep.Name
	if targetVersion != "" {
		pkgSpec = fmt.Sprintf("%s@^%s", dep.Name, targetVersion)
	}
	return fmt.Sprintf("poetry update %s", pkgSpec)
}
