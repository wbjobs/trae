package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	dockerclient "docker-compose-tui/docker"
	"docker-compose-tui/parser"
	"docker-compose-tui/tui"
)

func main() {
	var composeFile string
	var projectName string

	flag.StringVar(&composeFile, "f", "docker-compose.yml", "docker-compose 文件路径")
	flag.StringVar(&composeFile, "file", "docker-compose.yml", "docker-compose 文件路径")
	flag.StringVar(&projectName, "p", "", "项目名称 (默认为当前目录名)")
	flag.StringVar(&projectName, "project", "", "项目名称 (默认为当前目录名)")
	flag.Parse()

	if _, err := os.Stat(composeFile); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "错误: 找不到 compose 文件: %s\n", composeFile)
		os.Exit(1)
	}

	if projectName == "" {
		absPath, err := filepath.Abs(composeFile)
		if err == nil {
			dir := filepath.Dir(absPath)
			projectName = filepath.Base(dir)
		}
		projectName = strings.ToLower(projectName)
	}

	config, err := parser.ParseComposeFile(composeFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "解析 compose 文件失败: %v\n", err)
		os.Exit(1)
	}

	if len(config.Services) == 0 {
		fmt.Fprintf(os.Stderr, "警告: compose 文件中没有找到任何服务\n")
	}

	dockerCli, err := dockerclient.NewDockerClient()
	if err != nil {
		fmt.Fprintf(os.Stderr, "连接 Docker 失败: %v\n", err)
		os.Exit(1)
	}
	defer dockerCli.Close()

	app := tui.NewApp(config, projectName, dockerCli, composeFile)
	if err := app.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "TUI 运行错误: %v\n", err)
		os.Exit(1)
	}
}
