package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"cloudinspector/internal/cache"
)

var cacheCmd = &cobra.Command{
	Use:   "cache",
	Short: "管理本地扫描缓存",
}

var cacheStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "查看缓存状态",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCacheStatus()
	},
}

var cacheClearCmd = &cobra.Command{
	Use:   "clear",
	Short: "清除所有缓存",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCacheClear()
	},
}

func init() {
	cacheCmd.AddCommand(cacheStatusCmd)
	cacheCmd.AddCommand(cacheClearCmd)
	rootCmd.AddCommand(cacheCmd)
}

func runCacheStatus() error {
	cm, err := cache.NewCacheManager("")
	if err != nil {
		return fmt.Errorf("无法打开缓存: %w", err)
	}
	defer cm.Close()

	totalRes, totalAccts, lastScan, err := cm.GetStats()
	if err != nil {
		return fmt.Errorf("获取缓存统计: %w", err)
	}

	fmt.Println("缓存状态:")
	fmt.Println("==========")
	fmt.Printf("缓存路径: %s\n", cm.Path())
	fmt.Printf("资源总数: %d\n", totalRes)
	fmt.Printf("账号总数: %d\n", totalAccts)
	if lastScan != nil {
		fmt.Printf("上次扫描: %s\n", lastScan.Format("2006-01-02 15:04:05"))
	} else {
		fmt.Println("上次扫描: 无")
	}

	return nil
}

func runCacheClear() error {
	cm, err := cache.NewCacheManager("")
	if err != nil {
		return fmt.Errorf("无法打开缓存: %w", err)
	}

	path := cm.Path()
	cm.Close()

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("删除缓存文件失败: %w", err)
	}

	fmt.Printf("缓存已清除: %s\n", path)
	return nil
}
