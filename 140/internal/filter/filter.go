package filter

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var highlightStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#000000")).
	Background(lipgloss.Color("#ff0000")).
	Bold(true)

type HighlightedLine struct {
	Container   string
	Timestamp   string
	RawContent  string
	Rendered    string
	HasMatch    bool
}

type Filter struct {
	searchRegex   *regexp.Regexp
	filterRegex   *regexp.Regexp
	searchTerm    string
	filterTerm    string
	showTimestamp bool
	containerColor map[string]lipgloss.Style
	colorIndex     int
}

var containerColors = []lipgloss.Color{
	lipgloss.Color("#5fd75f"),
	lipgloss.Color("#5fafff"),
	lipgloss.Color("#ff87af"),
	lipgloss.Color("#ffd75f"),
	lipgloss.Color("#d787ff"),
	lipgloss.Color("#87d7ff"),
	lipgloss.Color("#ff5f5f"),
	lipgloss.Color("#87ff87"),
}

func New(showTimestamp bool) *Filter {
	return &Filter{
		showTimestamp:  showTimestamp,
		containerColor: make(map[string]lipgloss.Style),
		colorIndex:     0,
	}
}

func (f *Filter) SetFilter(pattern string) error {
	if pattern == "" {
		f.filterRegex = nil
		f.filterTerm = ""
		return nil
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Errorf("invalid filter regex: %w", err)
	}
	f.filterRegex = re
	f.filterTerm = pattern
	return nil
}

func (f *Filter) SetSearch(pattern string) error {
	if pattern == "" {
		f.searchRegex = nil
		f.searchTerm = ""
		return nil
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Errorf("invalid search regex: %w", err)
	}
	f.searchRegex = re
	f.searchTerm = pattern
	return nil
}

func (f *Filter) SearchTerm() string {
	return f.searchTerm
}

func (f *Filter) HasFilter() bool {
	return f.filterRegex != nil
}

func (f *Filter) HasSearch() bool {
	return f.searchRegex != nil
}

func (f *Filter) MatchesFilter(content string) bool {
	if f.filterRegex == nil {
		return true
	}
	return f.filterRegex.MatchString(content)
}

func (f *Filter) containerStyle(container string) lipgloss.Style {
	if s, ok := f.containerColor[container]; ok {
		return s
	}
	color := containerColors[f.colorIndex%len(containerColors)]
	s := lipgloss.NewStyle().Foreground(color).Bold(true)
	f.containerColor[container] = s
	f.colorIndex++
	return s
}

func (f *Filter) Process(container, timestamp, content string) HighlightedLine {
	line := HighlightedLine{
		Container:  container,
		Timestamp:  timestamp,
		RawContent: content,
	}

	var rendered string

	prefix := f.containerStyle(container).Render("[" + container + "]")

	if f.showTimestamp && timestamp != "" {
		tsStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#878787"))
		rendered = prefix + " " + tsStyle.Render(timestamp) + " "
	} else {
		rendered = prefix + " "
	}

	if f.searchRegex != nil {
		matches := f.searchRegex.FindAllStringIndex(content, -1)
		if len(matches) > 0 {
			line.HasMatch = true
			var highlighted strings.Builder
			lastEnd := 0
			for _, m := range matches {
				highlighted.WriteString(content[lastEnd:m[0]])
				highlighted.WriteString(highlightStyle.Render(content[m[0]:m[1]]))
				lastEnd = m[1]
			}
			highlighted.WriteString(content[lastEnd:])
			rendered += highlighted.String()
		} else {
			rendered += content
		}
	} else {
		rendered += content
	}

	line.Rendered = rendered
	return line
}

func (f *Filter) FindAllMatches(content string) []int {
	if f.searchRegex == nil {
		return nil
	}
	indices := f.searchRegex.FindAllStringIndex(content, -1)
	starts := make([]int, len(indices))
	for i, idx := range indices {
		starts[i] = idx[0]
	}
	return starts
}
