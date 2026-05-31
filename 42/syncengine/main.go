package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"filesync/remote"
	"filesync/sync"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}

		command := parts[0]

		switch command {
		case "ping":
			handlePing(parts[1:])
		case "sync":
			handleSync(parts[1:])
		case "list":
			if len(parts) < 2 {
				fmt.Fprintf(os.Stderr, "Error: 'list' command requires subcommand\n")
				continue
			}
			handleList(parts[2:])
		default:
			fmt.Fprintf(os.Stderr, "Error: unknown command: %s\n", command)
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "Error reading input: %v\n", err)
		os.Exit(1)
	}
}

func handlePing(args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "Error: 'ping' requires host argument\n")
		return
	}

	host := args[0]

	start := time.Now()

	sshConn, err := remote.NewSSHConnection(remote.SSHConfig{
		Host:       host,
		Port:       22,
		AuthMethod: "key_file",
	})

	if err != nil {
		result := sync.PingResult{
			Success: false,
			Host:    host,
			Error:   err.Error(),
		}
		outputJSON(result)
		return
	}
	defer sshConn.Close()

	elapsed := time.Since(start)

	result := sync.PingResult{
		Success: true,
		Host:    host,
		Latency: elapsed.String(),
	}
	outputJSON(result)
}

func handleSync(args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "Error: 'sync' requires task JSON\n")
		return
	}

	taskJSON := args[0]
	task, err := sync.ParseTask([]byte(taskJSON))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to parse task: %v\n", err)
		return
	}

	engine := sync.NewSyncEngine(task)
	result, err := engine.Run()

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: sync failed: %v\n", err)
	}

	outputJSON(result)
}

func handleList(args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "Error: 'list' requires subcommand\n")
		return
	}

	subcommand := args[0]

	switch subcommand {
	case "remote":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "Error: 'list remote' requires path\n")
			return
		}
		handleListRemote(args[2:])
	default:
		fmt.Fprintf(os.Stderr, "Error: unknown subcommand: %s\n", subcommand)
	}
}

func handleListRemote(args []string) {
	fmt.Fprintf(os.Stderr, "Error: 'list remote' not fully implemented in this version\n")
}

func outputJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to marshal result: %v\n", err)
		return
	}

	fmt.Println(string(data))
}
