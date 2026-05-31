package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"cloudinspector/internal/config"
	"cloudinspector/internal/types"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "管理配置文件",
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化配置文件 (生成示例配置)",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runConfigInit()
	},
}

var configListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出配置中的所有账号",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runConfigList()
	},
}

func init() {
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configListCmd)
	rootCmd.AddCommand(configCmd)
}

func runConfigInit() error {
	sampleCfg := &types.Config{
		Accounts: []types.AccountConfig{
			{
				Name:      "aws-prod",
				Provider:  types.ProviderAWS,
				Region:    "us-east-1",
				AccessKey: "YOUR_AWS_ACCESS_KEY",
				SecretKey: "YOUR_AWS_SECRET_KEY",
				RoleArn:   "",
			},
			{
				Name:      "aws-prod-assume-role",
				Provider:  types.ProviderAWS,
				Region:    "us-east-1",
				AccessKey: "YOUR_AWS_ACCESS_KEY",
				SecretKey: "YOUR_AWS_SECRET_KEY",
				RoleArn:   "arn:aws:iam::123456789012:role/InspectorRole",
			},
			{
				Name:      "aliyun-prod",
				Provider:  types.ProviderAliyun,
				Region:    "cn-hangzhou",
				AccessKey: "YOUR_ALIYUN_ACCESS_KEY",
				SecretKey: "YOUR_ALIYUN_SECRET_KEY",
			},
		},
	}

	if err := config.SaveConfig(cfgFile, sampleCfg); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	data, _ := json.MarshalIndent(sampleCfg, "", "  ")
	fmt.Println("配置文件已创建，内容如下:")
	fmt.Println(string(data))

	return nil
}

func runConfigList() error {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}

	fmt.Println("配置账号列表:")
	fmt.Println("==============")
	for i, acct := range cfg.Accounts {
		fmt.Printf("%d. [%s] %s - %s\n", i+1, acct.Provider, acct.Name, acct.Region)
		if acct.RoleArn != "" {
			fmt.Printf("   Role: %s\n", acct.RoleArn)
		}
	}

	return nil
}
