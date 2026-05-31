package risk

import (
	"fmt"
	"strings"

	"cloudinspector/internal/types"
)

type Detector struct{}

func NewDetector() *Detector {
	return &Detector{}
}

func (d *Detector) Detect(result *types.ScanResult) []types.RiskItem {
	var risks []types.RiskItem

	for _, resource := range result.Resources {
		switch resource.Type {
		case types.ResourceEC2, types.ResourceECS:
			risks = append(risks, d.detectUnusedInstance(resource)...)
		case types.ResourceEBS, types.ResourceDisk:
			risks = append(risks, d.detectUnusedDisk(resource)...)
			risks = append(risks, d.detectUnencryptedDisk(resource)...)
		case types.ResourceSecurityGroup:
			risks = append(risks, d.detectOpenSecurityGroup(resource)...)
		case types.ResourceRDS:
			risks = append(risks, d.detectPublicRDS(resource)...)
		case types.ResourceOSS:
			risks = append(risks, d.detectPublicOSS(resource)...)
			risks = append(risks, d.detectUnencryptedOSS(resource)...)
		}
	}

	return risks
}

func (d *Detector) detectUnusedInstance(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem
	status := strings.ToLower(resource.Status)

	if status == "stopped" || status == "stopping" || status == "shutting-down" || status == "terminated" {
		risks = append(risks, types.RiskItem{
			Provider:     resource.Provider,
			Category:     types.RiskUnusedResource,
			Level:        types.RiskMedium,
			ResourceID:   resource.ID,
			ResourceType: resource.Type,
			ResourceName: resource.Name,
			Region:       resource.Region,
			Account:      resource.Account,
			Message:      fmt.Sprintf("%s instance %s is in %s state, consider terminating if not needed", resource.Type, resource.Name, resource.Status),
			Details: map[string]interface{}{
				"status": resource.Status,
			},
		})
	}
	return risks
}

func (d *Detector) detectUnusedDisk(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	attached, hasAttach := resource.Properties["attached_to"]
	if !hasAttach || attached == "" {
		if strings.ToLower(resource.Status) == "available" || strings.ToLower(resource.Status) == "in-use" {
			risks = append(risks, types.RiskItem{
				Provider:     resource.Provider,
				Category:     types.RiskUnusedResource,
				Level:        types.RiskMedium,
				ResourceID:   resource.ID,
				ResourceType: resource.Type,
				ResourceName: resource.Name,
				Region:       resource.Region,
				Account:      resource.Account,
				Message:      fmt.Sprintf("%s disk %s is not attached to any instance", resource.Type, resource.Name),
				Details: map[string]interface{}{
					"status": resource.Status,
				},
			})
		}
	}
	return risks
}

func (d *Detector) detectUnencryptedDisk(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	encrypted, exists := resource.Properties["encrypted"]
	if !exists || encrypted == false || encrypted == "false" {
		risks = append(risks, types.RiskItem{
			Provider:     resource.Provider,
			Category:     types.RiskUnencryptedDisk,
			Level:        types.RiskHigh,
			ResourceID:   resource.ID,
			ResourceType: resource.Type,
			ResourceName: resource.Name,
			Region:       resource.Region,
			Account:      resource.Account,
			Message:      fmt.Sprintf("%s disk %s is not encrypted", resource.Type, resource.Name),
			Details: map[string]interface{}{
				"encrypted": encrypted,
			},
		})
	}
	return risks
}

func (d *Detector) detectOpenSecurityGroup(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	rulesRaw, exists := resource.Properties["rules"]
	if !exists {
		return risks
	}

	rules, ok := rulesRaw.([]map[string]interface{})
	if !ok {
		return risks
	}

	for _, rule := range rules {
		if !isIngressRule(rule) {
			continue
		}

		cidrs := getRuleCidrs(rule)
		for _, cidr := range cidrs {
			if cidr == "0.0.0.0/0" || cidr == "::/0" {
				portRange := getRulePortRange(rule)
				protocol := getRuleProtocol(rule)

				level := types.RiskHigh
				if portRange == "All" || portRange == "1-65535" || portRange == "-1/-1" {
					level = types.RiskCritical
				}

				risks = append(risks, types.RiskItem{
					Provider:     resource.Provider,
					Category:     types.RiskOpenSecurityGroup,
					Level:        level,
					ResourceID:   resource.ID,
					ResourceType: types.ResourceSecurityGroup,
					ResourceName: resource.Name,
					Region:       resource.Region,
					Account:      resource.Account,
					Message: fmt.Sprintf("Security group %s allows %s traffic on ports %s from %s (open to the world)",
						resource.Name, protocol, portRange, cidr),
					Details: map[string]interface{}{
						"cidr":     cidr,
						"protocol": protocol,
						"ports":    portRange,
					},
				})
			}
		}
	}
	return risks
}

func (d *Detector) detectPublicRDS(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	public, exists := resource.Properties["publicly_accessible"]
	if exists && public == true {
		risks = append(risks, types.RiskItem{
			Provider:     resource.Provider,
			Category:     types.RiskOpenSecurityGroup,
			Level:        types.RiskHigh,
			ResourceID:   resource.ID,
			ResourceType: types.ResourceRDS,
			ResourceName: resource.Name,
			Region:       resource.Region,
			Account:      resource.Account,
			Message:      fmt.Sprintf("RDS instance %s is publicly accessible", resource.Name),
			Details: map[string]interface{}{
				"publicly_accessible": true,
			},
		})
	}

	storageEncrypted, exists := resource.Properties["storage_encrypted"]
	if !exists || storageEncrypted == false {
		risks = append(risks, types.RiskItem{
			Provider:     resource.Provider,
			Category:     types.RiskUnencryptedStorage,
			Level:        types.RiskHigh,
			ResourceID:   resource.ID,
			ResourceType: types.ResourceRDS,
			ResourceName: resource.Name,
			Region:       resource.Region,
			Account:      resource.Account,
			Message:      fmt.Sprintf("RDS instance %s storage is not encrypted", resource.Name),
			Details: map[string]interface{}{
				"storage_encrypted": storageEncrypted,
			},
		})
	}
	return risks
}

func (d *Detector) detectPublicOSS(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	acl, exists := resource.Properties["acl"]
	if exists {
		aclStr := fmt.Sprintf("%v", acl)
		if aclStr == "public-read" || aclStr == "public-read-write" {
			risks = append(risks, types.RiskItem{
				Provider:     resource.Provider,
				Category:     types.RiskOpenSecurityGroup,
				Level:        types.RiskCritical,
				ResourceID:   resource.ID,
				ResourceType: types.ResourceOSS,
				ResourceName: resource.Name,
				Region:       resource.Region,
				Account:      resource.Account,
				Message:      fmt.Sprintf("OSS bucket %s has public access (%s)", resource.Name, aclStr),
				Details: map[string]interface{}{
					"acl": aclStr,
				},
			})
		}
	}
	return risks
}

func (d *Detector) detectUnencryptedOSS(resource types.Resource) []types.RiskItem {
	var risks []types.RiskItem

	if resource.Properties == nil {
		return risks
	}

	sse, exists := resource.Properties["server_side_encryption"]
	if !exists || sse == "" || sse == "None" {
		risks = append(risks, types.RiskItem{
			Provider:     resource.Provider,
			Category:     types.RiskUnencryptedStorage,
			Level:        types.RiskHigh,
			ResourceID:   resource.ID,
			ResourceType: types.ResourceOSS,
			ResourceName: resource.Name,
			Region:       resource.Region,
			Account:      resource.Account,
			Message:      fmt.Sprintf("OSS bucket %s does not have server-side encryption enabled", resource.Name),
			Details: map[string]interface{}{
				"server_side_encryption": sse,
			},
		})
	}
	return risks
}

func isIngressRule(rule map[string]interface{}) bool {
	direction, exists := rule["direction"]
	if exists {
		return fmt.Sprintf("%v", direction) == "ingress" || fmt.Sprintf("%v", direction) == ""
	}
	fromPort, fromExists := rule["from_port"]
	if fromExists && fromPort != nil {
		return true
	}
	return true
}

func getRuleCidrs(rule map[string]interface{}) []string {
	if raw, exists := rule["cidr_blocks"]; exists {
		if cidrs, ok := raw.([]string); ok {
			return cidrs
		}
	}
	if raw, exists := rule["source_cidr"]; exists {
		cidr := fmt.Sprintf("%v", raw)
		if cidr != "" {
			return []string{cidr}
		}
	}
	return nil
}

func getRulePortRange(rule map[string]interface{}) string {
	if raw, exists := rule["port_range"]; exists {
		pr := fmt.Sprintf("%v", raw)
		if pr != "" && pr != "<nil>" {
			return pr
		}
	}

	fromPort, fromExists := rule["from_port"]
	toPort, toExists := rule["to_port"]

	if fromExists && toExists {
		from := fmt.Sprintf("%v", fromPort)
		to := fmt.Sprintf("%v", toPort)
		if from == "-1" && to == "-1" {
			return "All"
		}
		if from == to {
			return from
		}
		return from + "-" + to
	}

	return "All"
}

func getRuleProtocol(rule map[string]interface{}) string {
	if raw, exists := rule["ip_protocol"]; exists {
		proto := fmt.Sprintf("%v", raw)
		if proto != "" && proto != "<nil>" {
			return strings.ToUpper(proto)
		}
	}
	return "ALL"
}

func ComputeSummary(results []types.ScanResult) types.ReportSummary {
	summary := types.ReportSummary{
		RiskByLevel:    make(map[types.RiskLevel]int),
		RiskByCategory: make(map[types.RiskCategory]int),
	}

	for _, result := range results {
		summary.TotalResources += len(result.Resources)
		summary.TotalRisks += len(result.Risks)
		for _, risk := range result.Risks {
			summary.RiskByLevel[risk.Level]++
			summary.RiskByCategory[risk.Category]++
		}
	}

	return summary
}
