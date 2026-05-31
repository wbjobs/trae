package tui

import "github.com/charmbracelet/bubbles/key"

type KeyMap struct {
	Up          key.Binding
	Down        key.Binding
	PageUp      key.Binding
	PageDown    key.Binding
	Top         key.Binding
	Bottom      key.Binding
	Search      key.Binding
	NextMatch   key.Binding
	PrevMatch   key.Binding
	ToggleStats key.Binding
	Quit        key.Binding
}

func DefaultKeyMap() KeyMap {
	return KeyMap{
		Up: key.NewBinding(
			key.WithKeys("k", "up"),
			key.WithHelp("k/↑", "scroll up"),
		),
		Down: key.NewBinding(
			key.WithKeys("j", "down"),
			key.WithHelp("j/↓", "scroll down"),
		),
		PageUp: key.NewBinding(
			key.WithKeys("u", "pgup"),
			key.WithHelp("u/PgUp", "page up"),
		),
		PageDown: key.NewBinding(
			key.WithKeys("d", "pgdown"),
			key.WithHelp("d/PgDn", "page down"),
		),
		Top: key.NewBinding(
			key.WithKeys("g"),
			key.WithHelp("g", "go to top"),
		),
		Bottom: key.NewBinding(
			key.WithKeys("G"),
			key.WithHelp("G", "go to bottom"),
		),
		Search: key.NewBinding(
			key.WithKeys("/"),
			key.WithHelp("/", "search"),
		),
		NextMatch: key.NewBinding(
			key.WithKeys("n"),
			key.WithHelp("n", "next match"),
		),
		PrevMatch: key.NewBinding(
			key.WithKeys("N"),
			key.WithHelp("N", "prev match"),
		),
		Quit: key.NewBinding(
			key.WithKeys("q", "ctrl+c"),
			key.WithHelp("q/Ctrl+C", "quit"),
		),
		ToggleStats: key.NewBinding(
			key.WithKeys("s"),
			key.WithHelp("s", "toggle stats"),
		),
	}
}
