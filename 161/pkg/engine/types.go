package engine

const (
	DefaultBufferSize  = 64 * 1024  // 64KB
	MaxBufferSize      = 4 * 1024 * 1024 // 4MB 软上限
	BodyThreshold      = 1 * 1024 * 1024 // 1MB: 超过此值使用流式模式
	StreamChunkSize    = 256 * 1024      // 256KB 流式块

	ActionContinue  = 0
	ActionShortCircuit = 1

	NeedBodyYes    = 1
	NeedBodyNo     = 0
	NeedBodyStream = 2
)

type FilterAction int32

type BodyNeed int32

type FilterMeta struct {
	Name     string   `json:"name"`
	Path     string   `json:"path"`
	Order    int      `json:"order"`
	Enabled  bool     `json:"enabled"`
	NeedBody BodyNeed `json:"needBody"`
	Config   map[string]string `json:"config,omitempty"`
}

type RequestContext struct {
	ID      string              `json:"id"`
	Method  string              `json:"method"`
	Path    string              `json:"path"`
	Headers map[string][]string `json:"headers"`
	Body    []byte              `json:"-"`
	BodyLen int                 `json:"bodyLen"`
	BodyStream bool             `json:"bodyStream"`
}

type ResponseContext struct {
	StatusCode int32               `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Body       []byte              `json:"-"`
	BodyLen    int                 `json:"bodyLen"`
}

type FilterResult struct {
	Action        FilterAction
	StatusCode    int32
	Headers       map[string][]string
	Body          []byte
	Modified      bool
	Err           error
}
