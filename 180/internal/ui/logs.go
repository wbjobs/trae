package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	logTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00BFFF")).
			Padding(0, 1)

	logHeaderStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFFFF")).
			Background(lipgloss.Color("#333333")).
			Padding(0, 1)

	logContainerIDStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#00FF00")).
				Bold(true)

	logInfoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#808080"))

	logLineStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#CCCCCC"))

	logHintStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#808080")).
			Italic(true)
)

func (m *Model) logsView() string {
	var sb interface{} = &stringBuilder{}
	b := sb.(*stringBuilder)

	b.writeString(logTitleStyle.Render("📜 容器日志"))
	b.writeString("\n\n")

	containerName := m.currentLogID
	for _, r := range m.rows {
		if r.ID == m.currentLogID {
			containerName = r.Name
			break
		}
	}

	header := fmt.Sprintf("容器: %s (ID: %s)",
		logContainerIDStyle.Render(containerName),
		m.currentLogID)
	b.writeString(logHeaderStyle.Render(header))
	b.writeString("\n\n")

	b.writeString(m.logsViewport.View())

	b.writeString("\n\n")
	b.writeString(logInfoStyle.Render(fmt.Sprintf("日志行数: %d", len(m.logsBuffer))))
	b.writeString("\n")
	b.writeString(logHintStyle.Render("按 ↑/↓ 滚动 | 按 q/esc 返回容器列表"))

	return b.String()
}

func (m *Model) logsViewWithContent(content string) string {
	var sb interface{} = &stringBuilder{}
	b := sb.(*stringBuilder)

	b.writeString(logTitleStyle.Render("📜 容器日志"))
	b.writeString("\n\n")

	containerName := m.currentLogID
	for _, r := range m.rows {
		if r.ID == m.currentLogID {
			containerName = r.Name
			break
		}
	}

	header := fmt.Sprintf("容器: %s (ID: %s)",
		logContainerIDStyle.Render(containerName),
		m.currentLogID)
	b.writeString(logHeaderStyle.Render(header))
	b.writeString("\n\n")

	b.writeString(content)

	b.writeString("\n\n")
	b.writeString(logInfoStyle.Render(fmt.Sprintf("日志行数: %d", len(m.logsBuffer))))
	b.writeString("\n")
	b.writeString(logHintStyle.Render("按 ↑/↓ 滚动 | 按 q/esc 返回容器列表"))

	return b.String()
}

func formatLogLine(line string) string {
	line = strings.TrimSpace(line)
	if line == "" {
		return ""
	}
	return logLineStyle.Render(line)
}
