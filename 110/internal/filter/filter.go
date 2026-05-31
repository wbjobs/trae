package filter

import (
	"strings"

	"http-mirror/internal/parser"
)

type URLFilter struct {
	prefixes []string
}

func New(prefixes []string) *URLFilter {
	normalized := make([]string, len(prefixes))
	for i, p := range prefixes {
		normalized[i] = strings.TrimRight(p, "/")
		if normalized[i] == "" {
			normalized[i] = "/"
		}
	}
	return &URLFilter{prefixes: normalized}
}

func (f *URLFilter) Match(req *parser.HTTPRequest) bool {
	if len(f.prefixes) == 0 {
		return true
	}

	path := req.Path
	for _, prefix := range f.prefixes {
		if prefix == "/" {
			return true
		}
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

func (f *URLFilter) Prefixes() []string {
	return f.prefixes
}
