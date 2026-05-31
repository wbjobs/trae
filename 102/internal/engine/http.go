package engine

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"google.golang.org/grpc/status"
)

// httpMux implements a minimal ServeHTTP that routes POST /mock/{svc}/{method}
// and GET /mock/_list to the engine.
type httpMux struct {
	engine *Engine
}

func (m *httpMux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	parts := strings.Split(path, "/")

	// GET /mock/_list - list all mock methods available.
	if r.Method == http.MethodGet && len(parts) >= 2 && parts[0] == "mock" && parts[1] == "_list" {
		m.list(w, r)
		return
	}

	// POST /mock/{service}/{method}
	if r.Method != http.MethodPost || len(parts) < 3 || parts[0] != "mock" {
		http.Error(w, "use POST /mock/{service}/{method}", http.StatusMethodNotAllowed)
		return
	}
	svc, method := parts[1], parts[2]

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Treat empty body as empty JSON object so simple requests work.
	if len(body) == 0 {
		body = []byte("{}")
	}

	resp, err := m.engine.InvokeJSON(r.Context(), svc, method, body)
	if err != nil {
		writeGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(resp)
}

func (m *httpMux) list(w http.ResponseWriter, _ *http.Request) {
	type methodItem struct {
		Service string   `json:"service"`
		Methods []string `json:"methods"`
	}
	out := []methodItem{}
	for _, name := range m.engine.reg.Services() {
		svc, _ := m.engine.reg.Service(name)
		ms := svc.Methods()
		methods := make([]string, 0, ms.Len())
		for i := 0; i < ms.Len(); i++ {
			methods = append(methods, string(ms.Get(i).Name()))
		}
		out = append(out, methodItem{Service: name, Methods: methods})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writeGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	httpCode := http.StatusInternalServerError
	if ok {
		httpCode = grpcToHTTP(st.Code())
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpCode)
	payload := map[string]interface{}{
		"error":   err.Error(),
		"grpc":    nil,
		"message": err.Error(),
	}
	if ok {
		payload["grpc"] = map[string]interface{}{
			"code":    int32(st.Code()),
			"message": st.Message(),
		}
	}
	_ = json.NewEncoder(w).Encode(payload)
}

// grpcToHTTP maps common gRPC status codes to HTTP status codes.
func grpcToHTTP(c uint32) int {
	switch c {
	case 0:
		return http.StatusOK
	case 1:
		return http.StatusRequestTimeout
	case 2:
		return http.StatusInternalServerError
	case 3:
		return http.StatusBadRequest
	case 4:
		return http.StatusGatewayTimeout
	case 5:
		return http.StatusNotFound
	case 6:
		return http.StatusConflict
	case 7:
		return http.StatusForbidden
	case 8:
		return http.StatusTooManyRequests
	case 9:
		return http.StatusBadRequest
	case 10:
		return http.StatusConflict
	case 11:
		return http.StatusBadRequest
	case 12:
		return http.StatusNotImplemented
	case 13:
		return http.StatusInternalServerError
	case 14:
		return http.StatusServiceUnavailable
	case 15:
		return http.StatusInternalServerError
	case 16:
		return http.StatusUnauthorized
	default:
		return http.StatusInternalServerError
	}
}
