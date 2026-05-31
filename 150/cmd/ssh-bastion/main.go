package main

import (
	"flag"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"ssh-bastion/internal/config"
	"ssh-bastion/internal/tui"
)

func main() {
	var (
		configPath string
		showHelp   bool
	)

	flag.StringVar(&configPath, "config", "config.yaml", "path to configuration file")
	flag.StringVar(&configPath, "c", "config.yaml", "path to configuration file (shorthand)")
	flag.BoolVar(&showHelp, "help", false, "show help message")
	flag.BoolVar(&showHelp, "h", false, "show help message (shorthand)")
	flag.Parse()

	if showHelp {
		printHelp()
		return
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	if len(cfg.Servers) == 0 {
		fmt.Fprintf(os.Stderr, "No servers configured in %s\n", configPath)
		os.Exit(1)
	}

	m := tui.NewModel(cfg)
	p := tea.NewProgram(m, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println(`SSH Bastion - Terminal UI for managing SSH sessions

Usage:
  ssh-bastion [flags]

Flags:
  -c, --config string   Path to configuration file (default "config.yaml")
  -h, --help            Show this help message

Configuration:
  The config file is YAML format with the following structure:

  servers:
    - name: server-name
      host: 192.168.1.10
      port: 22
      user: deploy
      auth:
        type: key          # or "password"
        key_path: ~/.ssh/id_rsa
      jump_host: bastion.example.com   # optional
      jump_port: 22
      jump_user: admin
      jump_auth:
        type: key
        key_path: ~/.ssh/bastion_key
      record: true
      record_dir: ./recordings

Features:
  - Multi-server management via YAML config
  - Jump host (ProxyJump) support
  - Session recording in ttyrec format
  - Session sharing (multi-user viewing)
  - Session playback with speed control`)
}
