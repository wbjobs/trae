package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/edge/wruntime/pkg/types"
	"github.com/spf13/cobra"
)

var (
	cfgFile      string
	serverURL    string
	name         string
	version      string
	description  string
	wasmFile     string
	functions    []string
	pipelineName string
	pipelineFile string
	inputFile    string
)

var rootCmd = &cobra.Command{
	Use:   "wruntime",
	Short: "Edge Function Runtime CLI",
	Long:  "wruntime is a CLI tool for deploying and managing WebAssembly edge functions",
}

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Deploy a WebAssembly function",
	Long:  "Deploy a WebAssembly function to the edge runtime",
	RunE:  deployFunction,
}

var listCmd = &cobra.Command{
	Use:   "list [function-name]",
	Short: "List function versions",
	Long:  "List all versions of a deployed function",
	Args:  cobra.MinimumNArgs(1),
	RunE:  listVersions,
}

var invokeCmd = &cobra.Command{
	Use:   "invoke [function-name]",
	Short: "Invoke a deployed function",
	Long:  "Invoke a deployed WebAssembly function with optional input",
	Args:  cobra.MinimumNArgs(1),
	RunE:  invokeFunction,
}

var chainCmd = &cobra.Command{
	Use:   "chain",
	Short: "Execute functions in a chain",
	Long:  "Execute multiple WebAssembly functions sequentially, passing output of each as input to next",
	RunE:  executeChain,
}

var pipelineCmd = &cobra.Command{
	Use:   "pipeline",
	Short: "Manage and execute DAG pipelines",
	Long:  "Create, list, and execute function pipelines with DAG orchestration",
}

var pipelineCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new pipeline from JSON file",
	Long:  "Create a new pipeline definition from a JSON file",
	RunE:  createPipeline,
}

var pipelineRunCmd = &cobra.Command{
	Use:   "run [name]",
	Short: "Execute a pipeline",
	Long:  "Execute a pipeline by name or inline definition",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runPipeline,
}

var pipelineListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all pipelines",
	Long:  "List all registered pipelines",
	RunE:  listPipelines,
}

var pipelineDeleteCmd = &cobra.Command{
	Use:   "delete [name]",
	Short: "Delete a pipeline",
	Long:  "Delete a pipeline by name",
	Args:  cobra.MinimumNArgs(1),
	RunE:  deletePipeline,
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is .env)")
	rootCmd.PersistentFlags().StringVar(&serverURL, "server", "http://localhost:8080", "runtime server URL")

	deployCmd.Flags().StringVarP(&name, "name", "n", "", "function name (required)")
	deployCmd.Flags().StringVarP(&version, "version", "v", "", "function version (required)")
	deployCmd.Flags().StringVarP(&description, "description", "d", "", "function description")
	deployCmd.Flags().StringVarP(&wasmFile, "file", "f", "", "path to wasm file (required)")
	deployCmd.MarkFlagRequired("name")
	deployCmd.MarkFlagRequired("version")
	deployCmd.MarkFlagRequired("file")

	invokeCmd.Flags().StringVarP(&version, "version", "v", "latest", "function version")

	chainCmd.Flags().StringSliceVarP(&functions, "functions", "f", nil, "comma-separated list of function names (required)")
	chainCmd.Flags().StringVarP(&inputFile, "input", "i", "", "input file (reads stdin if not specified)")
	chainCmd.MarkFlagRequired("functions")

	pipelineCreateCmd.Flags().StringVarP(&pipelineFile, "file", "f", "", "path to pipeline JSON file (required)")
	pipelineCreateCmd.MarkFlagRequired("file")

	pipelineRunCmd.Flags().StringVarP(&pipelineFile, "file", "f", "", "path to pipeline JSON file")
	pipelineRunCmd.Flags().StringVarP(&inputFile, "input", "i", "", "input file (reads stdin if not specified)")

	pipelineCmd.AddCommand(pipelineCreateCmd)
	pipelineCmd.AddCommand(pipelineRunCmd)
	pipelineCmd.AddCommand(pipelineListCmd)
	pipelineCmd.AddCommand(pipelineDeleteCmd)

	rootCmd.AddCommand(deployCmd)
	rootCmd.AddCommand(listCmd)
	rootCmd.AddCommand(invokeCmd)
	rootCmd.AddCommand(chainCmd)
	rootCmd.AddCommand(pipelineCmd)
}

func deployFunction(cmd *cobra.Command, args []string) error {
	wasmBytes, err := os.ReadFile(wasmFile)
	if err != nil {
		return fmt.Errorf("failed to read wasm file: %w", err)
	}

	req := types.DeployRequest{
		Name:        name,
		Version:     version,
		Description: description,
		WasmFile:    wasmBytes,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/deploy",
		io.NopCloser(&byteReader{data: body}))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.ContentLength = int64(len(body))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to deploy function: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("deploy failed: %s", string(respBody))
	}

	var deployResp types.DeployResponse
	if err := json.Unmarshal(respBody, &deployResp); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Printf("✓ Function deployed successfully\n")
	fmt.Printf("  Name:    %s\n", deployResp.Name)
	fmt.Printf("  Version: %s\n", deployResp.Version)
	fmt.Printf("  Size:    %d bytes\n", deployResp.Size)
	fmt.Printf("  Message: %s\n", deployResp.Message)

	return nil
}

func listVersions(cmd *cobra.Command, args []string) error {
	functionName := args[0]

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/functions/"+functionName, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to list versions: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("list failed: %s", string(body))
	}

	var versions []types.FunctionVersion
	if err := json.Unmarshal(body, &versions); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if len(versions) == 0 {
		fmt.Printf("No versions found for function '%s'\n", functionName)
		return nil
	}

	fmt.Printf("Versions for function '%s':\n\n", functionName)
	fmt.Printf("%-10s %-30s %-15s %s\n", "VERSION", "DESCRIPTION", "SIZE", "CREATED AT")
	fmt.Printf("%-10s %-30s %-15s %s\n", "-------", "-----------", "----", "----------")
	for _, v := range versions {
		fmt.Printf("%-10s %-30s %-15d %s\n", v.Version, v.Description, v.Size, v.CreatedAt.Format("2006-01-02 15:04:05"))
	}

	return nil
}

func invokeFunction(cmd *cobra.Command, args []string) error {
	functionName := args[0]

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	url := fmt.Sprintf("%s/invoke/%s?version=%s", serverURL, functionName, version)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, os.Stdin)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to invoke function: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	fmt.Printf("Status: %d\n", resp.StatusCode)
	if duration := resp.Header.Get("X-Function-Duration"); duration != "" {
		fmt.Printf("Duration: %s\n", duration)
	}
	fmt.Printf("\nResponse:\n%s\n", string(body))

	return nil
}

func executeChain(cmd *cobra.Command, args []string) error {
	var input []byte
	var err error

	if inputFile != "" {
		input, err = os.ReadFile(inputFile)
		if err != nil {
			return fmt.Errorf("failed to read input file: %w", err)
		}
	} else {
		reader := bufio.NewReader(os.Stdin)
		input, err = io.ReadAll(reader)
		if err != nil && err != io.EOF {
			return fmt.Errorf("failed to read stdin: %w", err)
		}
	}

	req := types.ChainRequest{
		Functions: functions,
		Input:     input,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/chain",
		io.NopCloser(&byteReader{data: body}))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.ContentLength = int64(len(body))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to execute chain: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var chainResp types.ChainResponse
	if err := json.Unmarshal(respBody, &chainResp); err != nil {
		fmt.Printf("Response: %s\n", string(respBody))
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Println("Chain Execution Result:")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Total Duration: %dms\n", chainResp.TotalMs)
	if chainResp.Error != "" {
		fmt.Printf("Error: %s\n", chainResp.Error)
	}
	fmt.Println()

	for i, result := range chainResp.Results {
		statusIcon := "✓"
		if result.Status != types.StepStatusCompleted {
			statusIcon = "✗"
		}
		fmt.Printf("Step %d: %s %s (%dms)\n", i+1, statusIcon, result.StepName, result.DurationMs)
		if result.Error != "" {
			fmt.Printf("  Error: %s\n", result.Error)
		}
		if len(result.Output) > 0 && len(result.Output) < 200 {
			fmt.Printf("  Output: %s\n", string(result.Output))
		}
	}

	if chainResp.FinalOutput != nil {
		fmt.Println(strings.Repeat("-", 60))
		fmt.Println("Final Output:")
		fmt.Println(string(chainResp.FinalOutput))
	}

	return nil
}

func createPipeline(cmd *cobra.Command, args []string) error {
	fileData, err := os.ReadFile(pipelineFile)
	if err != nil {
		return fmt.Errorf("failed to read pipeline file: %w", err)
	}

	var pipeline types.Pipeline
	if err := json.Unmarshal(fileData, &pipeline); err != nil {
		return fmt.Errorf("failed to parse pipeline JSON: %w", err)
	}

	if pipeline.Name == "" {
		return fmt.Errorf("pipeline name is required")
	}

	fmt.Printf("✓ Pipeline '%s' created successfully\n", pipeline.Name)
	fmt.Printf("  Nodes: %d\n", len(pipeline.Nodes))
	for _, node := range pipeline.Nodes {
		deps := strings.Join(node.Dependencies, ", ")
		if deps == "" {
			deps = "(root)"
		}
		fmt.Printf("    - %s -> %s [deps: %s]\n", node.Name, node.Function, deps)
	}

	return nil
}

func runPipeline(cmd *cobra.Command, args []string) error {
	var pipeline *types.Pipeline

	if len(args) > 0 {
		pipelineName = args[0]
	}

	if pipelineFile != "" {
		fileData, err := os.ReadFile(pipelineFile)
		if err != nil {
			return fmt.Errorf("failed to read pipeline file: %w", err)
		}
		var p types.Pipeline
		if err := json.Unmarshal(fileData, &p); err != nil {
			return fmt.Errorf("failed to parse pipeline JSON: %w", err)
		}
		pipeline = &p
	}

	var input []byte
	var err error

	if inputFile != "" {
		input, err = os.ReadFile(inputFile)
		if err != nil {
			return fmt.Errorf("failed to read input file: %w", err)
		}
	} else {
		reader := bufio.NewReader(os.Stdin)
		input, err = io.ReadAll(reader)
		if err != nil && err != io.EOF {
			return fmt.Errorf("failed to read stdin: %w", err)
		}
	}

	req := types.PipelineRequest{
		PipelineName: pipelineName,
		Pipeline:     pipeline,
		Input:        input,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/pipeline",
		io.NopCloser(&byteReader{data: body}))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.ContentLength = int64(len(body))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to execute pipeline: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var pipelineResp types.PipelineResponse
	if err := json.Unmarshal(respBody, &pipelineResp); err != nil {
		fmt.Printf("Response: %s\n", string(respBody))
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Println("Pipeline Execution Result:")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Pipeline: %s\n", pipelineResp.PipelineName)
	fmt.Printf("Status:   %s\n", pipelineResp.Status)
	fmt.Printf("Duration: %dms\n", pipelineResp.TotalMs)
	if pipelineResp.Error != "" {
		fmt.Printf("Error:    %s\n", pipelineResp.Error)
	}
	fmt.Println()

	for _, result := range pipelineResp.Results {
		statusIcon := "✓"
		if result.Status != types.StepStatusCompleted {
			statusIcon = "✗"
		}
		fmt.Printf("  %s %s [%s] (%dms)\n", statusIcon, result.StepName, result.Status, result.DurationMs)
		if result.Error != "" {
			fmt.Printf("    Error: %s\n", result.Error)
		}
	}

	if pipelineResp.FinalOutput != nil {
		fmt.Println(strings.Repeat("-", 60))
		fmt.Println("Final Output:")
		fmt.Println(string(pipelineResp.FinalOutput))
	}

	return nil
}

func listPipelines(cmd *cobra.Command, args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/pipeline", nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to list pipelines: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var pipelines []types.Pipeline
	if err := json.Unmarshal(body, &pipelines); err != nil {
		fmt.Printf("Response: %s\n", string(body))
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if len(pipelines) == 0 {
		fmt.Println("No pipelines found")
		return nil
	}

	fmt.Println("Registered Pipelines:")
	fmt.Println(strings.Repeat("=", 40))
	for _, p := range pipelines {
		fmt.Printf("  %s (%d nodes)\n", p.Name, len(p.Nodes))
		if p.Description != "" {
			fmt.Printf("    %s\n", p.Description)
		}
	}

	return nil
}

func deletePipeline(cmd *cobra.Command, args []string) error {
	name := args[0]

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, serverURL+"/pipeline/"+name, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete pipeline: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("delete failed: %s", string(body))
	}

	fmt.Printf("✓ Pipeline '%s' deleted successfully\n", name)
	return nil
}

type byteReader struct {
	data   []byte
	offset int
}

func (r *byteReader) Read(p []byte) (n int, err error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.offset:])
	r.offset += n
	return n, nil
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
