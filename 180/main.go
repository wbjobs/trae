package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"docker-monitor/internal/monitor"
	"docker-monitor/internal/ui"
)

func main() {
	mon, err := monitor.NewMonitor()
	if err != nil {
		fmt.Fprintf(os.Stderr, "无法连接到 Docker: %v\n", err)
		os.Exit(1)
	}
	defer mon.Close()

	m := ui.NewModel(mon)

	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "运行错误: %v\n", err)
		os.Exit(1)
	}
}
