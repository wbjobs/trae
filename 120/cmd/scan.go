package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"cloudinspector/internal/cache"
	"cloudinspector/internal/config"
	"cloudinspector/internal/output"
	"cloudinspector/internal/risk"
	"cloudinspector/internal/scanner"
	"cloudinspector/internal/types"
)

var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "扫描多云资源并检测风险",
	Long:  `扫描配置文件中指定的所有云账号资源，检测未使用资源、安全组过度开放、磁盘未加密等风险项。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runScan()
	},
}

func init() {
	rootCmd.AddCommand(scanCmd)
}

func runScan() error {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	ctx, cancel = context.WithTimeout(ctx, timeout)
	defer cancel()

	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}

	var providerFilter types.CloudProvider
	if provider != "" {
		providerFilter = types.CloudProvider(provider)
	}

	targetAccounts := config.FilterAccounts(cfg, accounts, providerFilter)
	if len(targetAccounts) == 0 {
		return fmt.Errorf("没有匹配的账号配置")
	}

	total := len(targetAccounts)
	modeStr := "全量"
	if incremental {
		modeStr = "增量"
	}
	fmt.Printf("开始扫描 %d 个账号 (%s模式, 超时: %s), 按 Ctrl+C 可中断...\n", total, modeStr, timeout)

	var cacheMgr *cache.CacheManager
	if incremental {
		cm, err := cache.NewCacheManager("")
		if err != nil {
			fmt.Printf("警告: 无法初始化缓存，降级为全量扫描: %v\n", err)
			incremental = false
		} else {
			cacheMgr = cm
			defer cm.Close()
			tr, ta, lastScan, _ := cm.GetStats()
			fmt.Printf("缓存状态: %d 资源, %d 账号", tr, ta)
			if lastScan != nil {
				fmt.Printf(", 上次: %s", lastScan.Format("2006-01-02 15:04"))
			}
			fmt.Println()
		}
	}

	var (
		results             []types.ScanResult
		mu                  sync.Mutex
		wg                  sync.WaitGroup
		completed           int32
		failed              int32
		skippedRiskDetect   int32
	)

	detector := risk.NewDetector()
	startTime := time.Now()

	for _, acct := range targetAccounts {
		wg.Add(1)
		go func(account types.AccountConfig) {
			defer wg.Done()

			if ctx.Err() != nil {
				return
			}

			fmt.Printf("[%s] 扫描中...\n", account.Name)

			s := scanner.NewScanner(account.Provider)
			if s == nil {
				fmt.Printf("[%s] 不支持的云服务商: %s\n", account.Name, account.Provider)
				atomic.AddInt32(&failed, 1)
				return
			}

			acctCtx, acctCancel := context.WithTimeout(ctx, 5*time.Minute)
			defer acctCancel()

			result, err := s.Scan(acctCtx, account)
			if err != nil {
				if acctCtx.Err() == context.DeadlineExceeded {
					fmt.Printf("[%s] 扫描超时\n", account.Name)
				} else if acctCtx.Err() == context.Canceled {
					fmt.Printf("[%s] 扫描已取消\n", account.Name)
				} else {
					fmt.Printf("[%s] 扫描失败: %v\n", account.Name, err)
				}
				atomic.AddInt32(&failed, 1)
				return
			}

			var risks []types.RiskItem

			if incremental && cacheMgr != nil {
				cached := cacheMgr.CheckIncremental(result.Resources, account.Name, account.Region)
				skipped := int32(len(cached.Resources))
				atomic.AddInt32(&skippedRiskDetect, skipped)

				risks = append(risks, cached.Risks...)

				if len(cached.UncachedKeys) > 0 {
					uncached := filterByKeys(result.Resources, cached.UncachedKeys)
					tempResult := &types.ScanResult{
						Account:  account.Name,
						Provider: account.Provider,
						Resources: uncached,
					}
					newRisks := detector.Detect(tempResult)
					risks = append(risks, newRisks...)
				}

				if skipped > 0 {
					fmt.Printf("[%s] 增量: %d 资源未变, %d 资源需检测\n",
						account.Name, skipped, len(cached.UncachedKeys))
				}
			} else {
				risks = detector.Detect(result)
			}

			result.Risks = risks

			mu.Lock()
			results = append(results, *result)
			mu.Unlock()

			atomic.AddInt32(&completed, 1)
			c := atomic.LoadInt32(&completed)
			f := atomic.LoadInt32(&failed)
			skip := atomic.LoadInt32(&skippedRiskDetect)
			extra := ""
			if incremental {
				extra = fmt.Sprintf(", %d 跳过检测", skip)
			}
			fmt.Printf("[%s] 完成: %d 资源, %d 风险 (%d/%d 已完成, %d 失败%s)\n",
				account.Name, len(result.Resources), len(result.Risks),
				c+f, total, f, extra)
		}(acct)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-ctx.Done():
		c := atomic.LoadInt32(&completed)
		f := atomic.LoadInt32(&failed)
		fmt.Printf("\n扫描已中断 (%d 已完成, %d 失败, %d 跳过)\n",
			c, f, total-int(c)-int(f))
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("扫描超时 (超过 %s)", timeout)
		}
		return fmt.Errorf("扫描已被用户中断")
	case <-done:
	}

	elapsed := time.Since(startTime)
	c := atomic.LoadInt32(&completed)
	f := atomic.LoadInt32(&failed)
	skip := atomic.LoadInt32(&skippedRiskDetect)

	skipMsg := ""
	if incremental && skip > 0 {
		skipMsg = fmt.Sprintf(", %d 资源跳过风险检测", skip)
	}
	fmt.Printf("扫描完成: %d 成功, %d 失败%s, 耗时 %s\n", c, f, skipMsg, elapsed.Round(time.Second))

	if len(results) == 0 {
		return fmt.Errorf("所有账号扫描失败")
	}

	report := output.BuildReport(results)

	formatType := output.OutputFormat(format)
	writer := output.NewWriter(formatType, outputFile)

	if err := writer.Write(report); err != nil {
		return fmt.Errorf("生成报告失败: %w", err)
	}

	if outputFile != "" {
		fmt.Printf("报告已保存到: %s\n", outputFile)
	}

	if incremental && cacheMgr != nil && len(results) > 0 {
		go func() {
			if err := cacheMgr.BatchSave(results); err != nil {
				fmt.Printf("警告: 保存缓存失败: %v\n", err)
			}
		}()

		currentKeys := collectAllResourceKeys(results)
		for _, acct := range targetAccounts {
			deleted, err := cacheMgr.PurgeStale(currentKeys, acct.Name)
			if err != nil {
				fmt.Printf("警告: 清理缓存失败 (%s): %v\n", acct.Name, err)
			} else if deleted > 0 {
				fmt.Printf("缓存清理: 移除 %d 个已删除资源 (%s)\n", deleted, acct.Name)
			}
		}
	}

	return nil
}

func filterByKeys(resources []types.Resource, keys []string) []types.Resource {
	keySet := make(map[string]bool, len(keys))
	for _, k := range keys {
		keySet[k] = true
	}
	var result []types.Resource
	for _, r := range resources {
		rk := fmt.Sprintf("%s:%s:%s:%s:%s",
			r.Provider, r.Account, r.Region, r.Type, r.ID)
		if keySet[rk] {
			result = append(result, r)
		}
	}
	return result
}

func collectAllResourceKeys(results []types.ScanResult) map[string]bool {
	keys := make(map[string]bool)
	for _, result := range results {
		for _, r := range result.Resources {
			key := fmt.Sprintf("%s:%s:%s:%s:%s",
				r.Provider, r.Account, r.Region, r.Type, r.ID)
			keys[key] = true
		}
	}
	return keys
}
