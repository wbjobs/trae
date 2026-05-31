package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"dlog/internal/docker"
	"dlog/internal/tui"
)

var (
	showTimestamp bool
	sinceFlag     string
	tailFlag      string
	followFlag    bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "dlog [containers...]",
		Short: "Docker log viewer with multi-container support",
		Long: `dlog is an interactive Docker log viewer that supports viewing logs
from multiple containers simultaneously with filtering, searching,
and Vim-style keybindings.

Examples:
  dlog web api db          View logs from containers web, api, and db
  dlog --since 10m web     View logs from the last 10 minutes
  dlog -t web api          Show timestamps in log output`,
		Args: cobra.ArbitraryArgs,
		RunE: run,
	}

	rootCmd.Flags().BoolVarP(&showTimestamp, "timestamps", "t", false, "show timestamps in log output")
	rootCmd.Flags().StringVar(&sinceFlag, "since", "", "show logs since timestamp (e.g., 10m, 1h30m) or Unix timestamp")
	rootCmd.Flags().StringVar(&tailFlag, "tail", "all", "number of lines to show from the end of the logs")
	rootCmd.Flags().BoolVarP(&followFlag, "follow", "f", true, "follow log output")

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func run(cmd *cobra.Command, args []string) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	containers := args
	if len(containers) == 0 {
		names, err := docker.ListContainers(ctx)
		if err != nil {
			return fmt.Errorf("failed to list containers: %w", err)
		}
		if len(names) == 0 {
			return fmt.Errorf("no containers found running")
		}
		containers = names
	}

	if len(containers) > 5 {
		return fmt.Errorf("maximum 5 containers supported, got %d", len(containers))
	}

	model, err := tui.NewModel(containers, showTimestamp)
	if err != nil {
		return fmt.Errorf("failed to create model: %w", err)
	}
	defer model.Cleanup()

	p := tea.NewProgram(
		model,
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)

	_, err = p.Run()
	if err != nil {
		return fmt.Errorf("error running program: %w", err)
	}

	return nil
}
