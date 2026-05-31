package middleware

import (
	"context"
	"io"
	"net/http"

	"github.com/dapr-wasm/middleware/pkg/engine"
	"github.com/google/uuid"
)

type Handler struct {
	engine *engine.Engine
}

func NewHandler(eng *engine.Engine) *Handler {
	return &Handler{engine: eng}
}

type Request struct {
	Method  string
	Path    string
	Headers http.Header
	Body    io.ReadCloser
}

type ResponseWriter interface {
	WriteHeader(statusCode int)
	Write(body []byte) (int, error)
	Header() http.Header
}

func (h *Handler) ServeHTTP(w ResponseWriter, r *Request) {
	body, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	bodyLen := len(body)
	req := &engine.RequestContext{
		ID:         uuid.New().String(),
		Method:     r.Method,
		Path:       r.Path,
		Headers:    r.Headers,
		Body:       body,
		BodyLen:    bodyLen,
		BodyStream: bodyLen > engine.BodyThreshold,
	}

	resp, err := h.engine.ExecuteChain(context.Background(), req)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	for k, v := range resp.Headers {
		for _, val := range v {
			w.Header().Add(k, val)
		}
	}

	w.WriteHeader(int(resp.StatusCode))
	if resp.Body != nil && resp.BodyLen > 0 {
		w.Write(resp.Body)
	}
}

func (h *Handler) HandleRequestResponse(ctx context.Context, req *engine.RequestContext) (*engine.ResponseContext, error) {
	return h.engine.ExecuteChain(ctx, req)
}
