package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var (
	cfgFile     string
	accounts    []string
	provider    string
	format      string
	outputFile  string
	verbose     bool
	timeout     time.Duration
	incremental bool
)

var rootCmd = &cobra.Command{
	Use:   "cloudinspector",
	Short: "多云资源巡检工具 - 扫描 AWS 和阿里云资源并检测安全风险",
	Long: `CloudInspector 是一个多云资源巡检 CLI 工具，支持扫描 AWS 和阿里云上的资源，
检测未使用资源、安全组过度开放、磁盘未加密等风险项。

支持的云服务商:
  - AWS (EC2, EBS, RDS, Security Groups)
  - 阿里云 (ECS, 磁盘, RDS, OSS, 安全组)

支持的风险检测:
  - 未使用资源 (停止的实例、未挂载磁盘)
  - 安全组过度开放 (0.0.0.0/0 入站规则)
  - 磁盘/存储未加密
  - RDS 公网访问
  - OSS Bucket 公开访问`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "配置文件路径 (默认: ~/.cloudinspector/config.json)")
	rootCmd.PersistentFlags().StringArrayVarP(&accounts, "account", "a", nil, "指定扫描的账号名称 (可多次指定, 不指定则扫描所有)")
	rootCmd.PersistentFlags().StringVarP(&provider, "provider", "p", "", "指定云服务商 (aws 或 aliyun)")
	rootCmd.PersistentFlags().StringVarP(&format, "format", "f", "text", "输出格式 (text, json, html)")
	rootCmd.PersistentFlags().StringVarP(&outputFile, "output", "o", "", "输出文件路径 (默认: stdout)")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "显示详细输出")
	rootCmd.PersistentFlags().DurationVarP(&timeout, "timeout", "t", 10*time.Minute, "扫描超时时间 (如 5m, 30s, 1h)")
	rootCmd.PersistentFlags().BoolVar(&incremental, "incremental", false, "启用增量扫描 (使用本地缓存跳过未变化资源的风险检测)")
}
