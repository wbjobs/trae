package fixer

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/depaudit/depaudit/pkg/scanner"
)

type MavenFixer struct{}

func (f *MavenFixer) Name() string { return "maven" }

func (f *MavenFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "maven"
}

func (f *MavenFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	pomPath := filepath.Join(path, "pom.xml")
	if _, err := os.Stat(pomPath); err == nil {
		dst := filepath.Join(backupDir, "pom.xml.bak")
		if err := copyFile(pomPath, dst); err != nil {
			return "", err
		}
	}
	
	return backupDir, nil
}

func (f *MavenFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	if dryRun {
		return nil
	}
	
	parts := splitMavenPackage(dep.Name)
	if len(parts) != 2 {
		return fmt.Errorf("invalid maven package name: %s", dep.Name)
	}
	
	groupId, artifactId := parts[0], parts[1]
	
	args := []string{
		"versions:use-next-releases",
		"-Dincludes=" + groupId + ":" + artifactId,
	}
	
	cmd := exec.Command("mvn", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *MavenFixer) Rollback(path string, backupDir string) error {
	pomPath := filepath.Join(path, "pom.xml")
	backupPath := filepath.Join(backupDir, "pom.xml.bak")
	
	if _, err := os.Stat(backupPath); err == nil {
		if err := copyFile(backupPath, pomPath); err != nil {
			return err
		}
	}
	
	return nil
}

func (f *MavenFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	parts := splitMavenPackage(dep.Name)
	if len(parts) != 2 {
		return fmt.Sprintf("mvn versions:use-next-releases -Dincludes=%s", dep.Name)
	}
	groupId, artifactId := parts[0], parts[1]
	return fmt.Sprintf("mvn versions:use-next-releases -Dincludes=%s:%s", groupId, artifactId)
}

func splitMavenPackage(name string) []string {
	parts := make([]string, 2)
	idx := lastIndexOf(name, ":")
	if idx == -1 {
		parts[0] = name
		parts[1] = ""
	} else {
		parts[0] = name[:idx]
		parts[1] = name[idx+1:]
	}
	return parts
}

func lastIndexOf(s string, char byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == char {
			return i
		}
	}
	return -1
}

type GradleFixer struct{}

func (f *GradleFixer) Name() string { return "gradle" }

func (f *GradleFixer) CanHandle(dep scanner.Dependency) bool {
	return dep.PackageManager == "gradle"
}

func (f *GradleFixer) Backup(path string) (string, error) {
	backupDir := ".depaudit-backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", err
	}
	
	gradleFiles := []string{"build.gradle", "build.gradle.kts"}
	for _, file := range gradleFiles {
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

func (f *GradleFixer) Update(dep scanner.Dependency, targetVersion string, dryRun bool) error {
	if dryRun {
		return nil
	}
	
	args := []string{"dependencies", "--update-locks"}
	
	cmd := exec.Command("./gradlew", args...)
	if _, err := os.Stat("./gradlew"); os.IsNotExist(err) {
		cmd = exec.Command("gradle", args...)
	}
	
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	
	return cmd.Run()
}

func (f *GradleFixer) Rollback(path string, backupDir string) error {
	gradleFiles := []string{"build.gradle", "build.gradle.kts"}
	
	for _, file := range gradleFiles {
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

func (f *GradleFixer) GetUpdateCommand(dep scanner.Dependency, targetVersion string) string {
	return "./gradlew dependencies --update-locks"
}
