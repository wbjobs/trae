package parser

import (
	"bufio"
	"bytes"
	"fmt"
	"net/http"
)

type HTTPRequest struct {
	Method  string
	URL     string
	Path    string
	Host    string
	Headers http.Header
	Body    []byte
	Raw     []byte
}

func ParseHTTPRequest(raw []byte) (*HTTPRequest, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty payload")
	}

	reader := bufio.NewReader(bytes.NewReader(raw))
	req, err := http.ReadRequest(reader)
	if err != nil {
		return nil, fmt.Errorf("parsing HTTP request: %w", err)
	}
	defer req.Body.Close()

	return &HTTPRequest{
		Method:  req.Method,
		URL:     req.URL.String(),
		Path:    req.URL.Path,
		Host:    req.Host,
		Headers: req.Header,
		Raw:     raw,
	}, nil
}
