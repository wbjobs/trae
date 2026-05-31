package recorder

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Record represents a single captured request-response pair, or a
// pre-existing entry loaded from the YAML file.
type Record struct {
	Service  string                 `yaml:"-"`
	Method   string                 `yaml:"-"`
	Request  map[string]interface{} `yaml:"-"`
	Response map[string]interface{} `yaml:"-"`
	// rawResponse holds the original YAML response string (may be a Go
	// template).  When nil the entry will be emitted from Response.
	rawResponse *string
	DelayMs     int `yaml:"delay_ms,omitempty"`
	// isCaptured is true when this record was produced by the proxy (as
	// opposed to loaded from disk).
	isCaptured bool
}

// Recorder captures request-response pairs and writes them as YAML mock
// templates that can be loaded directly by the mock engine.
type Recorder struct {
	mu      sync.Mutex
	records map[string]map[string]*Record
	outPath string
	dirty   bool
}

// New creates a Recorder that will write its YAML output to outPath.
// If outPath already exists it is loaded so that new records can be
// merged with user-maintained entries.
func New(outPath string) (*Recorder, error) {
	r := &Recorder{
		records: make(map[string]map[string]*Record),
		outPath: outPath,
	}
	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return nil, err
	}
	if data, err := os.ReadFile(outPath); err == nil && len(data) > 0 {
		_ = r.loadExisting(data)
	}
	return r, nil
}

// loadExisting parses a pre-existing mock YAML.  Every entry is preserved
// verbatim (including Go templates) via rawResponse so that flushing does
// not destroy user-authored content.
func (r *Recorder) loadExisting(data []byte) error {
	var existing struct {
		Services map[string]struct {
			Methods map[string]struct {
				Response string `yaml:"response"`
				DelayMs  int    `yaml:"delay_ms"`
			} `yaml:"methods"`
		} `yaml:"services"`
	}
	if err := yaml.Unmarshal(data, &existing); err != nil {
		return err
	}
	for svcName, svc := range existing.Services {
		if _, ok := r.records[svcName]; !ok {
			r.records[svcName] = make(map[string]*Record)
		}
		for methodName, m := range svc.Methods {
			resp := m.Response
			rec := &Record{
				Service:     svcName,
				Method:      methodName,
				DelayMs:     m.DelayMs,
				rawResponse: &resp,
				isCaptured:  false,
			}
			// If it's plain JSON, also parse into Response so we can
			// emit a compact representation on flush.
			trimmed := strings.TrimSpace(m.Response)
			var parsed map[string]interface{}
			if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil {
				rec.Response = parsed
			}
			r.records[svcName][methodName] = rec
		}
	}
	return nil
}

// Capture stores a request-response pair.  Pre-existing entries for the
// same service/method are overwritten only by new captures.
func (r *Recorder) Capture(service, method string, requestJSON, responseJSON []byte, elapsedMs int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var reqMap, respMap map[string]interface{}
	_ = json.Unmarshal(requestJSON, &reqMap)
	_ = json.Unmarshal(responseJSON, &respMap)

	if r.records[service] == nil {
		r.records[service] = make(map[string]*Record)
	}
	r.records[service][method] = &Record{
		Service:     service,
		Method:      method,
		Request:     reqMap,
		Response:    respMap,
		DelayMs:     elapsedMs,
		isCaptured:  true,
		rawResponse: nil,
	}
	r.dirty = true
}

// Flush writes the current set of records to the YAML output file.
// Entries that were loaded from disk but never captured are preserved
// verbatim.  Captured entries are emitted as compact JSON literals.
func (r *Recorder) Flush() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.dirty {
		return nil
	}

	out := struct {
		Services map[string]interface{} `yaml:"services"`
	}{
		Services: make(map[string]interface{}),
	}

	svcNames := make([]string, 0, len(r.records))
	for k := range r.records {
		svcNames = append(svcNames, k)
	}
	sort.Strings(svcNames)

	for _, svcName := range svcNames {
		methods := r.records[svcName]
		methodNames := make([]string, 0, len(methods))
		for k := range methods {
			methodNames = append(methodNames, k)
		}
		sort.Strings(methodNames)

		svcEntry := map[string]interface{}{
			"methods": map[string]interface{}{},
		}
		for _, mn := range methodNames {
			rec := methods[mn]
			entry := map[string]interface{}{}
			if rec.DelayMs > 0 {
				entry["delay_ms"] = rec.DelayMs
			}

			if rec.rawResponse != nil && !rec.isCaptured {
				// Preserve user-authored template verbatim.
				entry["response"] = yamlBlock(*rec.rawResponse)
			} else if rec.Response != nil {
				respJSON, err := json.MarshalIndent(rec.Response, "  ", "  ")
				if err == nil {
					entry["response"] = yamlBlock(string(respJSON))
				}
			} else if rec.rawResponse != nil {
				entry["response"] = yamlBlock(*rec.rawResponse)
			}

			svcEntry["methods"].(map[string]interface{})[mn] = entry
		}
		out.Services[svcName] = svcEntry
	}

	data, err := yaml.Marshal(out)
	if err != nil {
		return err
	}
	if err := os.WriteFile(r.outPath, data, 0644); err != nil {
		return err
	}
	r.dirty = false
	return nil
}

// yamlBlock returns a value that marshals as a YAML block scalar (|).
func yamlBlock(s string) interface{} {
	return yamlBlockScalar{s}
}

type yamlBlockScalar struct {
	Value string
}

// MarshalYAML implements yaml.Marshaler.
func (b yamlBlockScalar) MarshalYAML() (interface{}, error) {
	node := &yaml.Node{
		Kind:  yaml.ScalarNode,
		Style: yaml.LiteralStyle,
		Tag:   "!!str",
		Value: strings.TrimRight(b.Value, "\n"),
	}
	return node, nil
}

// Stats returns the number of captured records (service, method counts).
func (r *Recorder) Stats() (int, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	svcCount := len(r.records)
	methodCount := 0
	for _, m := range r.records {
		methodCount += len(m)
	}
	return svcCount, methodCount
}

// CapturedCount returns the number of methods captured during this session.
func (r *Recorder) CapturedCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, m := range r.records {
		for _, rec := range m {
			if rec.isCaptured {
				n++
			}
		}
	}
	return n
}

// String returns a human-readable summary.
func (r *Recorder) String() string {
	svc, m := r.Stats()
	c := r.CapturedCount()
	return fmt.Sprintf("recorded %d new methods (%d total across %d services) -> %s", c, m, svc, r.outPath)
}
