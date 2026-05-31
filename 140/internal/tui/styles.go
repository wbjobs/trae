package tui

import "github.com/charmbracelet/lipgloss"

var (
	AppStyle = lipgloss.NewStyle().
			Margin(0, 1)

	TitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ffffff")).
			Background(lipgloss.Color("#5f5faf")).
			Bold(true).
			Padding(0, 1)

	StatusBarStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#000000")).
			Background(lipgloss.Color("#878787")).
			Padding(0, 1)

	InputStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ffff5f")).
			Bold(true)

	HelpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#606060"))

	SearchMatchStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#000000")).
				Background(lipgloss.Color("#ff5f5f")).
				Bold(true)

	NoMatchesStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ff5f5f")).
			Bold(true)
)
