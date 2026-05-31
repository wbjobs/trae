package types

import "time"

type FunctionVersion struct {
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	Size        int64     `json:"size"`
}

type FunctionConfig struct {
	Name         string            `json:"name"`
	Version      string            `json:"version"`
	MemoryLimit  uint64            `json:"memory_limit"`
	TimeoutMs    uint32            `json:"timeout_ms"`
	EnvVars      map[string]string `json:"env_vars"`
	Annotations  map[string]string `json:"annotations"`
}

type FunctionRequest struct {
	FunctionName string            `json:"function_name"`
	Version      string            `json:"version,omitempty"`
	Body         []byte            `json:"body"`
	Headers      map[string]string `json:"headers"`
	Method       string            `json:"method"`
	Path         string            `json:"path"`
	Query        map[string]string `json:"query"`
}

type FunctionResponse struct {
	StatusCode int               `json:"status_code"`
	Body       []byte            `json:"body"`
	Headers    map[string]string `json:"headers"`
	Error      string            `json:"error,omitempty"`
	DurationMs int64             `json:"duration_ms"`
}

type DeployRequest struct {
	Name         string `json:"name"`
	Version      string `json:"version"`
	Description  string `json:"description"`
	WasmFile     []byte `json:"wasm_file"`
	MemoryLimit  uint64 `json:"memory_limit"`
	TimeoutMs    uint32 `json:"timeout_ms"`
}

type DeployResponse struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Name      string `json:"name"`
	Version   string `json:"version"`
	Size      int64  `json:"size"`
}

type StepStatus string

const (
	StepStatusPending   StepStatus = "pending"
	StepStatusRunning   StepStatus = "running"
	StepStatusCompleted StepStatus = "completed"
	StepStatusFailed    StepStatus = "failed"
	StepStatusSkipped   StepStatus = "skipped"
)

type StepResult struct {
	StepName   string           `json:"step_name"`
	Function   string           `json:"function"`
	Version    string           `json:"version"`
	Status     StepStatus       `json:"status"`
	Input      []byte           `json:"input,omitempty"`
	Output     []byte           `json:"output,omitempty"`
	Error      string           `json:"error,omitempty"`
	DurationMs int64            `json:"duration_ms"`
	StartedAt  time.Time        `json:"started_at,omitempty"`
	EndedAt    time.Time        `json:"ended_at,omitempty"`
	Response   FunctionResponse `json:"response"`
}

type DAGNode struct {
	Name         string   `json:"name"`
	Function     string   `json:"function"`
	Version      string   `json:"version,omitempty"`
	Dependencies []string `json:"dependencies,omitempty"`
	InputFrom    []string `json:"input_from,omitempty"`
	Condition    string   `json:"condition,omitempty"`
	RetryCount   int      `json:"retry_count,omitempty"`
}

type Pipeline struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Nodes       []DAGNode         `json:"nodes"`
	TimeoutMs   int64             `json:"timeout_ms,omitempty"`
	EnvVars     map[string]string `json:"env_vars,omitempty"`
	CreatedAt   time.Time         `json:"created_at,omitempty"`
	UpdatedAt   time.Time         `json:"updated_at,omitempty"`
}

type PipelineRequest struct {
	PipelineName string                 `json:"pipeline_name,omitempty"`
	Pipeline     *Pipeline              `json:"pipeline,omitempty"`
	Input        []byte                 `json:"input"`
	Headers      map[string]string      `json:"headers,omitempty"`
	Params       map[string]interface{} `json:"params,omitempty"`
}

type PipelineResponse struct {
	PipelineName string       `json:"pipeline_name"`
	Status       StepStatus   `json:"status"`
	Results      []StepResult `json:"results"`
	FinalOutput  []byte       `json:"final_output,omitempty"`
	Error        string       `json:"error,omitempty"`
	TotalMs      int64        `json:"total_ms"`
	StartedAt    time.Time    `json:"started_at"`
	EndedAt      time.Time    `json:"ended_at,omitempty"`
}

type ChainRequest struct {
	Functions []string          `json:"functions"`
	Input     []byte            `json:"input"`
	Headers   map[string]string `json:"headers,omitempty"`
}

type ChainResponse struct {
	Results     []StepResult `json:"results"`
	FinalOutput []byte       `json:"final_output"`
	Error       string       `json:"error,omitempty"`
	TotalMs     int64        `json:"total_ms"`
}
