package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/edge/wruntime/pkg/storage"
	"github.com/edge/wruntime/pkg/types"
	"github.com/edge/wruntime/pkg/wasm"
)

type FunctionInvoker interface {
	Invoke(ctx context.Context, wasmBytes []byte, req *types.FunctionRequest) (*types.FunctionResponse, error)
}

type Storage interface {
	GetFunction(ctx context.Context, name, version string) ([]byte, *types.FunctionConfig, error)
}

type Orchestrator struct {
	storage    Storage
	invoker    FunctionInvoker
	pipelines  map[string]*types.Pipeline
	mu         sync.RWMutex
}

func New(store *storage.Storage, runtime *wasm.Runtime) *Orchestrator {
	return &Orchestrator{
		storage:   store,
		invoker:   runtime,
		pipelines: make(map[string]*types.Pipeline),
	}
}

func (o *Orchestrator) RegisterPipeline(p *types.Pipeline) {
	o.mu.Lock()
	defer o.mu.Unlock()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	o.pipelines[p.Name] = p
}

func (o *Orchestrator) GetPipeline(name string) (*types.Pipeline, bool) {
	o.mu.RLock()
	defer o.mu.RUnlock()
	p, ok := o.pipelines[name]
	return p, ok
}

func (o *Orchestrator) ListPipelines() []*types.Pipeline {
	o.mu.RLock()
	defer o.mu.RUnlock()
	list := make([]*types.Pipeline, 0, len(o.pipelines))
	for _, p := range o.pipelines {
		list = append(list, p)
	}
	return list
}

func (o *Orchestrator) DeletePipeline(name string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	if _, ok := o.pipelines[name]; ok {
		delete(o.pipelines, name)
		return true
	}
	return false
}

func (o *Orchestrator) ExecuteChain(ctx context.Context, req *types.ChainRequest) (*types.ChainResponse, error) {
	if len(req.Functions) == 0 {
		return nil, fmt.Errorf("no functions specified")
	}

	startTime := time.Now()
	results := make([]types.StepResult, 0, len(req.Functions))
	currentInput := req.Input

	for i, funcName := range req.Functions {
		stepName := fmt.Sprintf("step-%d-%s", i+1, funcName)

		stepResult, stepOutput, err := o.executeStep(ctx, stepName, funcName, "", currentInput, req.Headers)
		stepResult.StepName = stepName
		results = append(results, stepResult)

		if err != nil {
			return &types.ChainResponse{
				Results: results,
				Error:   err.Error(),
				TotalMs: time.Since(startTime).Milliseconds(),
			}, nil
		}

		currentInput = stepOutput
	}

	return &types.ChainResponse{
		Results:     results,
		FinalOutput: currentInput,
		TotalMs:     time.Since(startTime).Milliseconds(),
	}, nil
}

func (o *Orchestrator) ExecutePipeline(ctx context.Context, req *types.PipelineRequest) (*types.PipelineResponse, error) {
	var pipeline *types.Pipeline
	if req.PipelineName != "" {
		var ok bool
		pipeline, ok = o.GetPipeline(req.PipelineName)
		if !ok {
			return nil, fmt.Errorf("pipeline '%s' not found", req.PipelineName)
		}
	} else if req.Pipeline != nil {
		pipeline = req.Pipeline
	} else {
		return nil, fmt.Errorf("no pipeline specified")
	}

	startTime := time.Now()

	if pipeline.TimeoutMs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(pipeline.TimeoutMs)*time.Millisecond)
		defer cancel()
	}

	results, finalOutput, err := o.executeDAG(ctx, pipeline, req.Input, req.Headers)

	status := types.StepStatusCompleted
	if err != nil {
		status = types.StepStatusFailed
	}

	return &types.PipelineResponse{
		PipelineName: pipeline.Name,
		Status:       status,
		Results:      results,
		FinalOutput:  finalOutput,
		Error:        errMsg(err),
		TotalMs:      time.Since(startTime).Milliseconds(),
		StartedAt:    startTime,
		EndedAt:      time.Now(),
	}, nil
}

func (o *Orchestrator) executeDAG(ctx context.Context, pipeline *types.Pipeline, input []byte, headers map[string]string) ([]types.StepResult, []byte, error) {
	nodes := pipeline.Nodes
	if len(nodes) == 0 {
		return nil, nil, fmt.Errorf("no nodes in pipeline")
	}

	if err := validateDAG(nodes); err != nil {
		return nil, nil, err
	}

	resultsMap := &sync.Map{}
	statusMap := &sync.Map{}
	var executionErr error
	errOnce := sync.Once{}

	inDegree := make(map[string]int)
	nodeDeps := make(map[string][]string)
	for _, node := range nodes {
		inDegree[node.Name] = len(node.Dependencies)
		nodeDeps[node.Name] = node.Dependencies
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)
	readyChan := make(chan *types.DAGNode, len(nodes))

	for _, node := range nodes {
		if len(node.Dependencies) == 0 {
			readyChan <- &node
		}
	}

	processNode := func(n *types.DAGNode) {
		defer wg.Done()
		defer func() { <-sem }()

		select {
		case <-ctx.Done():
			return
		default:
		}

		if _, failed := statusMap.Load("failed_" + n.Name); failed {
			return
		}

		stepInput := input
		if len(n.InputFrom) > 0 {
			stepInput = aggregateInputs(resultsMap, n.InputFrom)
		} else if len(n.Dependencies) > 0 {
			stepInput = getLatestOutput(resultsMap, n.Dependencies)
		}

		stepResult, output, err := o.executeStep(ctx, n.Name, n.Function, n.Version, stepInput, headers)
		stepResult.StepName = n.Name
		stepResult.Version = n.Version

		if err != nil {
			statusMap.Store("failed_"+n.Name, true)
			errOnce.Do(func() { executionErr = err })
			resultsMap.Store(n.Name, stepResult)

			o.markDependentsFailed(nodes, n.Name, statusMap, resultsMap)
			return
		}

		statusMap.Store("completed_"+n.Name, true)
		resultsMap.Store(n.Name, stepResult)

		_ = output

		for _, next := range nodes {
			if hasDep(next.Dependencies, n.Name) {
				remaining := decInDegree(inDegree, next.Name)
				if remaining == 0 {
					wg.Add(1)
					sem <- struct{}{}
					go processNode(&next)
				}
			}
		}
	}

	pendingCount := len(readyChan)
	for pendingCount > 0 {
		select {
		case <-ctx.Done():
			return collectResults(resultsMap, len(nodes)), nil, fmt.Errorf("pipeline timeout: %w", ctx.Err())
		case node := <-readyChan:
			pendingCount--
			wg.Add(1)
			sem <- struct{}{}
			go processNode(node)
		}
	}

	wg.Wait()

	results := collectResults(resultsMap, len(nodes))

	var finalOutput []byte
	for i := len(nodes) - 1; i >= 0; i-- {
		if result, ok := resultsMap.Load(nodes[i].Name); ok {
			step := result.(types.StepResult)
			if step.Status == types.StepStatusCompleted {
				finalOutput = step.Output
				break
			}
		}
	}

	return results, finalOutput, executionErr
}

func (o *Orchestrator) markDependentsFailed(nodes []types.DAGNode, failedNode string, statusMap *sync.Map, resultsMap *sync.Map) {
	for _, node := range nodes {
		if hasDep(node.Dependencies, failedNode) {
			if _, already := statusMap.Load("failed_" + node.Name); !already {
				statusMap.Store("failed_"+node.Name, true)
				resultsMap.Store(node.Name, types.StepResult{
					StepName: node.Name,
					Function: node.Function,
					Version:  node.Version,
					Status:   types.StepStatusSkipped,
					Error:    "dependency failed",
				})
				o.markDependentsFailed(nodes, node.Name, statusMap, resultsMap)
			}
		}
	}
}

func hasDep(deps []string, name string) bool {
	for _, d := range deps {
		if d == name {
			return true
		}
	}
	return false
}

func decInDegree(inDegree map[string]int, name string) int {
	inDegree[name]--
	return inDegree[name]
}

func (o *Orchestrator) executeStep(ctx context.Context, stepName, funcName, version string, input []byte, headers map[string]string) (types.StepResult, []byte, error) {
	startTime := time.Now()
	result := types.StepResult{
		StepName:  stepName,
		Function:  funcName,
		Version:   version,
		Status:    types.StepStatusRunning,
		Input:     input,
		StartedAt: startTime,
	}

	wasmBytes, _, err := o.storage.GetFunction(ctx, funcName, version)
	if err != nil {
		result.Status = types.StepStatusFailed
		result.Error = err.Error()
		result.EndedAt = time.Now()
		result.DurationMs = time.Since(startTime).Milliseconds()
		return result, nil, fmt.Errorf("failed to load function '%s': %w", funcName, err)
	}

	req := &types.FunctionRequest{
		FunctionName: funcName,
		Version:      version,
		Body:         input,
		Headers:      headers,
	}

	resp, err := o.invoker.Invoke(ctx, wasmBytes, req)
	if err != nil {
		result.Status = types.StepStatusFailed
		result.Error = err.Error()
		result.EndedAt = time.Now()
		result.DurationMs = time.Since(startTime).Milliseconds()
		return result, nil, err
	}

	result.Status = types.StepStatusCompleted
	result.Output = resp.Body
	result.Response = *resp
	result.EndedAt = time.Now()
	result.DurationMs = time.Since(startTime).Milliseconds()

	return result, resp.Body, nil
}

func validateDAG(nodes []types.DAGNode) error {
	nodeMap := make(map[string]bool)
	for _, node := range nodes {
		nodeMap[node.Name] = true
	}

	for _, node := range nodes {
		for _, dep := range node.Dependencies {
			if !nodeMap[dep] {
				return fmt.Errorf("node '%s' depends on unknown node '%s'", node.Name, dep)
			}
		}
	}

	visited := make(map[string]bool)
	recStack := make(map[string]bool)

	for _, node := range nodes {
		if hasCycle(&node, nodes, visited, recStack) {
			return fmt.Errorf("cycle detected in DAG at node '%s'", node.Name)
		}
	}

	return nil
}

func hasCycle(node *types.DAGNode, nodes []types.DAGNode, visited, recStack map[string]bool) bool {
	if recStack[node.Name] {
		return true
	}
	if visited[node.Name] {
		return false
	}

	visited[node.Name] = true
	recStack[node.Name] = true

	for _, dep := range node.Dependencies {
		for _, n := range nodes {
			if n.Name == dep {
				if hasCycle(&n, nodes, visited, recStack) {
					return true
				}
			}
		}
	}

	recStack[node.Name] = false
	return false
}

func findReadyNodes(nodes []types.DAGNode, completed, failed map[string]bool) []*types.DAGNode {
	var ready []*types.DAGNode
	for i := range nodes {
		node := &nodes[i]
		if completed[node.Name] || failed[node.Name] {
			continue
		}
		if hasAllDependenciesCompleted(node, completed) {
			ready = append(ready, node)
		}
	}
	return ready
}

func hasAllDependenciesCompleted(node *types.DAGNode, completed map[string]bool) bool {
	for _, dep := range node.Dependencies {
		if !completed[dep] {
			return false
		}
	}
	return true
}

func hasAnyDependencyFailed(node *types.DAGNode, failed map[string]bool) bool {
	for _, dep := range node.Dependencies {
		if failed[dep] {
			return true
		}
	}
	return false
}

func aggregateInputs(results *sync.Map, inputFrom []string) []byte {
	type combined struct {
		Results map[string]json.RawMessage `json:"results"`
	}

	c := combined{Results: make(map[string]json.RawMessage)}
	for _, name := range inputFrom {
		if result, ok := results.Load(name); ok {
			c.Results[name] = result.(types.StepResult).Output
		}
	}

	data, _ := json.Marshal(c)
	return data
}

func getLatestOutput(results *sync.Map, deps []string) []byte {
	if len(deps) == 0 {
		return nil
	}
	lastDep := deps[len(deps)-1]
	if result, ok := results.Load(lastDep); ok {
		return result.(types.StepResult).Output
	}
	return nil
}

func collectResults(results *sync.Map, count int) []types.StepResult {
	collected := make([]types.StepResult, 0, count)
	results.Range(func(key, value interface{}) bool {
		collected = append(collected, value.(types.StepResult))
		return true
	})
	return collected
}

func errMsg(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
