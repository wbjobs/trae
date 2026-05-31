package scanner

import (
	"context"
	"fmt"
	"sync"

	"github.com/aliyun/alibaba-cloud-sdk-go/sdk"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk/auth/credentials"
	ecsClient "github.com/aliyun/alibaba-cloud-sdk-go/services/ecs"
	rdsClient "github.com/aliyun/alibaba-cloud-sdk-go/services/rds"
	ossClient "github.com/aliyun/alibaba-cloud-sdk-go/services/oss"

	"cloudinspector/internal/types"
)

type AliyunScanner struct{}

func NewAliyunScanner() *AliyunScanner {
	return &AliyunScanner{}
}

func (s *AliyunScanner) Scan(ctx context.Context, account types.AccountConfig) (*types.ScanResult, error) {
	client, err := s.buildClient(account)
	if err != nil {
		return nil, fmt.Errorf("build Aliyun client for %s: %w", account.Name, err)
	}

	result := &types.ScanResult{
		Account:  account.Name,
		Provider: types.ProviderAliyun,
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

	wg.Add(5)
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanECS(c, client, account) }, "ECS scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanDisks(c, client, account) }, "Disk scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanSecurityGroups(c, client, account) }, "Security Group scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanRDS(c, account) }, "RDS scan")
	go scanOne(func(c context.Context) ([]types.Resource, error) { return s.scanOSS(c, account) }, "OSS scan")

	wg.Wait()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	if len(scanErrors) > 0 {
		for _, e := range scanErrors {
			result.Resources = append(result.Resources, types.Resource{
				Provider: types.ProviderAliyun,
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

func (s *AliyunScanner) buildClient(account types.AccountConfig) (*ecsClient.Client, error) {
	cred := credentials.NewAccessKeyCredential(account.AccessKey, account.SecretKey)
	config := sdk.NewConfig()
	config.RegionId = account.Region
	client, err := ecsClient.NewClientWithOptions(account.Region, config, cred)
	if err != nil {
		return nil, fmt.Errorf("create ECS client: %w", err)
	}
	return client, nil
}

func (s *AliyunScanner) scanECS(ctx context.Context, client *ecsClient.Client, account types.AccountConfig) ([]types.Resource, error) {
	request := ecsClient.CreateDescribeInstancesRequest()
	request.Scheme = "https"
	request.PageSize = "100"

	var allResources []types.Resource
	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		response, err := client.DescribeInstances(request)
		if err != nil {
			return nil, fmt.Errorf("describe instances: %w", err)
		}
		for _, inst := range response.Instances.Instance {
			props := map[string]interface{}{
				"instance_type": inst.InstanceType,
				"status":        inst.Status,
				"private_ips":   inst.VpcAttributes.PrivateIpAddress.IpAddress,
				"public_ips":    inst.PublicIpAddress.IpAddress,
				"os_name":       inst.OSName,
			}
			var sgIDs []string
			for _, sg := range inst.SecurityGroupIds.SecurityGroupId {
				sgIDs = append(sgIDs, sg)
			}
			props["security_group_ids"] = sgIDs

			allResources = append(allResources, types.Resource{
				Provider:   types.ProviderAliyun,
				Type:       types.ResourceECS,
				ID:         inst.InstanceId,
				Name:       inst.InstanceName,
				Region:     account.Region,
				Account:    account.Name,
				Status:     inst.Status,
				Properties: props,
			})
		}
		if response.PageNumber*response.PageSize >= response.TotalCount {
			break
		}
		request.PageNumber = fmt.Sprintf("%d", response.PageNumber+1)
	}
	return allResources, nil
}

func (s *AliyunScanner) scanDisks(ctx context.Context, client *ecsClient.Client, account types.AccountConfig) ([]types.Resource, error) {
	request := ecsClient.CreateDescribeDisksRequest()
	request.Scheme = "https"
	request.PageSize = "100"

	var allResources []types.Resource
	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		response, err := client.DescribeDisks(request)
		if err != nil {
			return nil, fmt.Errorf("describe disks: %w", err)
		}
		for _, disk := range response.Disks.Disk {
			props := map[string]interface{}{
				"size_gb":   disk.Size,
				"category":  disk.Category,
				"encrypted": disk.Encrypted,
				"status":    disk.Status,
				"type":      disk.Type,
			}
			if disk.InstanceId != "" {
				props["attached_to"] = disk.InstanceId
			}
			allResources = append(allResources, types.Resource{
				Provider:   types.ProviderAliyun,
				Type:       types.ResourceDisk,
				ID:         disk.DiskId,
				Name:       disk.DiskName,
				Region:     account.Region,
				Account:    account.Name,
				Status:     disk.Status,
				Properties: props,
			})
		}
		if response.PageNumber*response.PageSize >= response.TotalCount {
			break
		}
		request.PageNumber = fmt.Sprintf("%d", response.PageNumber+1)
	}
	return allResources, nil
}

func (s *AliyunScanner) scanSecurityGroups(ctx context.Context, client *ecsClient.Client, account types.AccountConfig) ([]types.Resource, error) {
	request := ecsClient.CreateDescribeSecurityGroupsRequest()
	request.Scheme = "https"
	request.PageSize = "100"

	var allResources []types.Resource
	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		response, err := client.DescribeSecurityGroups(request)
		if err != nil {
			return nil, fmt.Errorf("describe security groups: %w", err)
		}
		for _, sg := range response.SecurityGroups.SecurityGroup {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			permRequest := ecsClient.CreateDescribeSecurityGroupAttributeRequest()
			permRequest.SecurityGroupId = sg.SecurityGroupId
			permResponse, err := client.DescribeSecurityGroupAttribute(permRequest)
			var rules []map[string]interface{}
			if err == nil {
				for _, perm := range permResponse.Permissions.Permission {
					rule := map[string]interface{}{
						"policy":      perm.Policy,
						"priority":    perm.Priority,
						"ip_protocol": perm.IpProtocol,
						"port_range":  perm.PortRange,
						"source_cidr": perm.SourceCidrIp,
						"dest_cidr":   perm.DestCidrIp,
						"direction":   perm.Direction,
					}
					rules = append(rules, rule)
				}
			}
			props := map[string]interface{}{
				"vpc_id":     sg.VpcId,
				"rules":      rules,
				"rule_count": sg.SecurityGroupEcsCount,
			}
			allResources = append(allResources, types.Resource{
				Provider:   types.ProviderAliyun,
				Type:       types.ResourceSecurityGroup,
				ID:         sg.SecurityGroupId,
				Name:       sg.SecurityGroupName,
				Region:     account.Region,
				Account:    account.Name,
				Status:     "active",
				Properties: props,
			})
		}
		if response.PageNumber*response.PageSize >= response.TotalCount {
			break
		}
		request.PageNumber = fmt.Sprintf("%d", response.PageNumber+1)
	}
	return allResources, nil
}

func (s *AliyunScanner) scanRDS(ctx context.Context, account types.AccountConfig) ([]types.Resource, error) {
	cred := credentials.NewAccessKeyCredential(account.AccessKey, account.SecretKey)
	config := sdk.NewConfig()
	client, err := rdsClient.NewClientWithOptions(account.Region, config, cred)
	if err != nil {
		return nil, fmt.Errorf("create RDS client: %w", err)
	}

	request := rdsClient.CreateDescribeDBInstancesRequest()
	request.Scheme = "https"
	request.PageSize = "100"

	var allResources []types.Resource
	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		response, err := client.DescribeDBInstances(request)
		if err != nil {
			return nil, fmt.Errorf("describe RDS instances: %w", err)
		}
		for _, dbi := range response.Items.DBInstance {
			props := map[string]interface{}{
				"engine":            dbi.Engine,
				"engine_version":    dbi.EngineVersion,
				"instance_class":    dbi.DBInstanceClass,
				"storage_gb":        dbi.DBInstanceStorage,
				"storage_type":      dbi.StorageType,
				"status":            dbi.DBInstanceStatus,
				"public_accessible": dbi.PublicConnectionString != "",
			}
			allResources = append(allResources, types.Resource{
				Provider:   types.ProviderAliyun,
				Type:       types.ResourceRDS,
				ID:         dbi.DBInstanceId,
				Name:       dbi.DBInstanceDescription,
				Region:     account.Region,
				Account:    account.Name,
				Status:     dbi.DBInstanceStatus,
				Properties: props,
			})
		}
		if response.PageNumber*response.PageSize >= response.TotalRecordCount {
			break
		}
		request.PageNumber = fmt.Sprintf("%d", response.PageNumber+1)
	}
	return allResources, nil
}

func (s *AliyunScanner) scanOSS(ctx context.Context, account types.AccountConfig) ([]types.Resource, error) {
	cred := credentials.NewAccessKeyCredential(account.AccessKey, account.SecretKey)
	config := sdk.NewConfig()
	client, err := ossClient.NewClientWithOptions(account.Region, config, cred)
	if err != nil {
		return nil, fmt.Errorf("create OSS client: %w", err)
	}

	request := ossClient.CreateListBucketsRequest()
	request.Scheme = "https"

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	response, err := client.ListBuckets(request)
	if err != nil {
		return nil, fmt.Errorf("list OSS buckets: %w", err)
	}

	var allResources []types.Resource
	for _, bucket := range response.Buckets.Bucket {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		props := map[string]interface{}{
			"creation_date": bucket.CreationDate,
			"location":      bucket.Location,
			"storage_class": bucket.StorageClass,
		}

		aclRequest := ossClient.CreateGetBucketInfoRequest()
		aclRequest.BucketName = bucket.Name
		aclResponse, err := client.GetBucketInfo(aclRequest)
		if err == nil {
			props["acl"] = aclResponse.Bucket.AccessControlList.Grant
			props["server_side_encryption"] = aclResponse.Bucket.ServerSideEncryptionRule.SSEAlgorithm
		}

		allResources = append(allResources, types.Resource{
			Provider:   types.ProviderAliyun,
			Type:       types.ResourceOSS,
			ID:         bucket.Name,
			Name:       bucket.Name,
			Region:     account.Region,
			Account:    account.Name,
			Status:     "active",
			Properties: props,
		})
	}
	return allResources, nil
}
