package fixer

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type NPMFixer struct{}

func (f *NPMFixer) Name() string { return "npm" }

func (f *NPMFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "npm"
}

func (f *NPMFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"package.json", "package-lock.json"}
	var lastBackup string
	
	for _, file := range filesToBackup {
		src := filepath.Join(path, file)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		
		dst := filepath.Join(backupDir, file+".bak")
		if err := copyFile(src, dst); err != nil {
			return "", err
		}
		lastBackup = dst
	}
	
	return backupDir, nil
}

func (f *NPMFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	var args []string
	if dryRun {
		args = []string{"update", dep.Name + "@" + targetVersion, "--dry-run"}
	} else {
		args = []string{"install", dep.Name + "@" + targetVersion}
	}
	
	cmd := exec.Command("npm", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *NPMFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"package.json", "package-lock.json"}
	
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

func (f *NPMFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	return fmt.Sprintf("npm install %s@%s", dep.Name, targetVersion)
}

type YarnFixer struct{}

func (f *YarnFixer) Name() string { return "yarn" }

func (f *YarnFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "yarn"
}

func (f *YarnFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"package.json", "yarn.lock"}
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

func (f *YarnFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	args := []string{"upgrade", dep.Name + "@" + targetVersion}
	if dryRun {
		args = append(args, "--dry-run")
	}
	
	cmd := exec.Command("yarn", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *YarnFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"package.json", "yarn.lock"}
	
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

func (f *YarnFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	return fmt.Sprintf("yarn upgrade %s@%s", dep.Name, targetVersion)
}

type PnpmFixer struct{}

func (f *PnpmFixer) Name() string { return "pnpm" }

func (f *PnpmFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "pnpm"
}

func (f *PnpmFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	filesToBackup := []string{"package.json", "pnpm-lock.yaml"}
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

func (f *PnpmFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	args := []string{"update", dep.Name + "@" + targetVersion}
	if dryRun {
		args = append(args, "--lockfile-only")
	}
	
	cmd := exec.Command("pnpm", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *PnpmFixer) Rollback(path string, backupDir string) error {
	filesToRestore := []string{"package.json", "pnpm-lock.yaml"}
	
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

func (f *PnpmFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	return fmt.Sprintf("pnpm update %s@%s", dep.Name, targetVersion)
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()
	
	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()
	
	_, err = io.Copy(destFile, sourceFile)
	return err
}
