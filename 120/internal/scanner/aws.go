package scanner

import (
	"context"
	"fmt"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/rds"
	"github.com/aws/aws-sdk-go-v2/service/sts"

	"cloudinspector/internal/types"
)

type AWSScanner struct{}

func NewAWSScanner() *AWSScanner {
	return &AWSScanner{}
}

func (s *AWSScanner) Scan(ctx context.Context, account types.AccountConfig) (*types.ScanResult, error) {
	cfg, err := s.buildConfig(ctx, account)
	if err != nil {
		return nil, fmt.Errorf("build AWS config for %s: %w", account.Name, err)
	}

	result := &types.ScanResult{
		Account:  account.Name,
		Provider: types.ProviderAWS,
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var scanErrors []error

	scanOne := func(fn func(context.Context) ([]types.Resource, error), label string) {
		defer wg.Done()
		if ctx.Err() != nil {
			return
		}
		resources, err := fn(ctx)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			scanErrors = append(scanErrors, fmt.Errorf("%s: %w", label, err))
			return
		}
		result.Resources = append(result.Resources, resources...)
	}

	wg.Add(4)
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanEC2(c, cfg, account) }, "EC2 scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanEBS(c, cfg, account) }, "EBS scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanSecurityGroups(c, cfg, account) }, "Security Group scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanRDS(c, cfg, account) }, "RDS scan")

	wg.Wait()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	if len(scanErrors) > 0 {
		for _, e := range scanErrors {
			result.Resources = append(result.Resources, types.Resource{
				Provider: types.ProviderAWS,
				Type:     "error",
				ID:       "scan-error",
				Name:     e.Error(),
				Region:   account.Region,
				Account:  account.Name,
			})
		}
	}

	return result, nil
}

func (s *AWSScanner) buildConfig(ctx context.Context, account types.AccountConfig) (aws.Config, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(account.Region),
	}

	if account.AccessKey != "" && account.SecretKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(account.AccessKey, account.SecretKey, ""),
		))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return cfg, fmt.Errorf("load AWS config: %w", err)
	}

	if account.RoleArn != "" {
		stsClient := sts.NewFromConfig(cfg)
		assumeRoleCreds := stscreds.NewAssumeRoleProvider(stsClient, account.RoleArn)
		cfg.Credentials = aws.NewCredentialsCache(assumeRoleCreds)
	}

	return cfg, nil
}

func (s *AWSScanner) scanEC2(ctx context.Context, cfg aws.Config, account types.AccountConfig) ([]types.Resource, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	client := ec2.NewFromConfig(cfg)
	output, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{})
	if err != nil {
		return nil, fmt.Errorf("describe instances: %w", err)
	}

	var resources []types.Resource
	for _, reservation := range output.Reservations {
		for _, inst := range reservation.Instances {
			name := getEC2NameTag(inst.Tags)
			state := string(inst.State.Name)
			props := map[string]interface{}{
				"instance_type":   inst.InstanceType,
				"launch_time":     inst.LaunchTime.String(),
				"private_ip":      firstString(inst.PrivateIpAddress),
				"public_ip":       firstString(inst.PublicIpAddress),
				"security_groups": extractSecurityGroupNames(inst.SecurityGroups),
			}
			resources = append(resources, types.Resource{
				Provider:   types.ProviderAWS,
				Type:       types.ResourceEC2,
				ID:         aws.ToString(inst.InstanceId),
				Name:       name,
				Region:     account.Region,
				Account:    account.Name,
				Status:     state,
				Properties: props,
			})
		}
	}
	return resources, nil
}

func (s *AWSScanner) scanEBS(ctx context.Context, cfg aws.Config, account types.AccountConfig) ([]types.Resource, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	client := ec2.NewFromConfig(cfg)
	output, err := client.DescribeVolumes(ctx, &ec2.DescribeVolumesInput{})
	if err != nil {
		return nil, fmt.Errorf("describe volumes: %w", err)
	}

	var resources []types.Resource
	for _, vol := range output.Volumes {
		name := getEBSTagName(vol.Tags)
		props := map[string]interface{}{
			"size_gb":     vol.Size,
			"volume_type": vol.VolumeType,
			"encrypted":   aws.ToBool(vol.Encrypted),
			"state":       vol.State,
		}
		if len(vol.Attachments) > 0 {
			props["attached_to"] = aws.ToString(vol.Attachments[0].InstanceId)
		}
		resources = append(resources, types.Resource{
			Provider:   types.ProviderAWS,
			Type:       types.ResourceEBS,
			ID:         aws.ToString(vol.VolumeId),
			Name:       name,
			Region:     account.Region,
			Account:    account.Name,
			Status:     string(vol.State),
			Properties: props,
		})
	}
	return resources, nil
}

func (s *AWSScanner) scanSecurityGroups(ctx context.Context, cfg aws.Config, account types.AccountConfig) ([]types.Resource, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	client := ec2.NewFromConfig(cfg)
	output, err := client.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{})
	if err != nil {
		return nil, fmt.Errorf("describe security groups: %w", err)
	}

	var resources []types.Resource
	for _, sg := range output.SecurityGroups {
		var rules []map[string]interface{}
		for _, perm := range sg.IpPermissions {
			rule := map[string]interface{}{
				"ip_protocol": aws.ToString(perm.IpProtocol),
				"from_port":   perm.FromPort,
				"to_port":     perm.ToPort,
			}
			var cidrs []string
			for _, cidr := range perm.IpRanges {
				cidrs = append(cidrs, aws.ToString(cidr.CidrIp))
			}
			rule["cidr_blocks"] = cidrs
			rules = append(rules, rule)
		}
		props := map[string]interface{}{
			"vpc_id":     aws.ToString(sg.VpcId),
			"rules":      rules,
			"rule_count": len(sg.IpPermissions),
		}
		resources = append(resources, types.Resource{
			Provider:   types.ProviderAWS,
			Type:       types.ResourceSecurityGroup,
			ID:         aws.ToString(sg.GroupId),
			Name:       aws.ToString(sg.GroupName),
			Region:     account.Region,
			Account:    account.Name,
			Status:     "active",
			Properties: props,
		})
	}
	return resources, nil
}

func (s *AWSScanner) scanRDS(ctx context.Context, cfg aws.Config, account types.AccountConfig) ([]types.Resource, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	client := rds.NewFromConfig(cfg)
	output, err := client.DescribeDBInstances(ctx, &rds.DescribeDBInstancesInput{})
	if err != nil {
		return nil, fmt.Errorf("describe RDS instances: %w", err)
	}

	var resources []types.Resource
	for _, dbi := range output.DBInstances {
		props := map[string]interface{}{
			"engine":         aws.ToString(dbi.Engine),
			"engine_version": aws.ToString(dbi.EngineVersion),
			"instance_class": aws.ToString(dbi.DBInstanceClass),
			"allocated_storage_gb": dbi.AllocatedStorage,
			"storage_encrypted":    dbi.StorageEncrypted,
			"multi_az":             dbi.MultiAZ,
			"publicly_accessible":  dbi.PubliclyAccessible,
		}
		resources = append(resources, types.Resource{
			Provider:   types.ProviderAWS,
			Type:       types.ResourceRDS,
			ID:         aws.ToString(dbi.DBInstanceIdentifier),
			Name:       aws.ToString(dbi.DBInstanceIdentifier),
			Region:     account.Region,
			Account:    account.Name,
			Status:     aws.ToString(dbi.DBInstanceStatus),
			Properties: props,
		})
	}
	return resources, nil
}

func getEC2NameTag(tags []ec2types.Tag) string {
	for _, tag := range tags {
		if aws.ToString(tag.Key) == "Name" {
			return aws.ToString(tag.Value)
		}
	}
	return ""
}

func getEBSTagName(tags []ec2types.Tag) string {
	for _, tag := range tags {
		if aws.ToString(tag.Key) == "Name" {
			return aws.ToString(tag.Value)
		}
	}
	return ""
}

func firstString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func extractSecurityGroupNames(groups []ec2types.GroupIdentifier) []string {
	var names []string
	for _, g := range groups {
		names = append(names, aws.ToString(g.GroupId)+":"+aws.ToString(g.GroupName))
	}
	return names
}
