package cmd

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"k8s-topology/pkg/k8s"
	"k8s-topology/pkg/tui"
)

var (
	kubeconfig string
	namespace  string
	watchMode  bool
)

var rootCmd = &cobra.Command{
	Use:   "k8s-topology",
	Short: "K8s 资源拓扑查看器",
	Long: `一个交互式 Kubernetes 资源拓扑查看 CLI 工具。
以树形结构展示 Deployment → ReplicaSet → Pod → Container 的资源关系，
支持按命名空间过滤、按资源类型展开/折叠，查看资源 YAML 摘要，
以及 Watch 模式实时监听集群资源变化并高亮显示。`,
	RunE: runTopology,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().StringVar(&kubeconfig, "kubeconfig", "", "kubeconfig 文件路径 (默认 ~/.kube/config 或 KUBECONFIG 环境变量)")
	rootCmd.Flags().StringVarP(&namespace, "namespace", "n", "", "指定命名空间 (默认查看所有命名空间)")
	rootCmd.Flags().BoolVarP(&watchMode, "watch", "w", false, "启用 Watch 模式，实时监听集群资源变化")
}

func runTopology(cmd *cobra.Command, args []string) error {
	clientset, err := k8s.NewClient(kubeconfig)
	if err != nil {
		return fmt.Errorf("连接集群失败: %w", err)
	}

	model := tui.NewModel(clientset, namespace, watchMode)
	p := tea.NewProgram(model, tea.WithMouseCellMotion(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI 运行失败: %w", err)
	}
	return nil
}
