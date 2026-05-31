package types

type CloudProvider string

const (
	ProviderAWS     CloudProvider = "aws"
	ProviderAliyun  CloudProvider = "aliyun"
)

type ResourceType string

const (
	ResourceEC2       ResourceType = "ec2"
	ResourceECS       ResourceType = "ecs"
	ResourceRDS       ResourceType = "rds"
	ResourceOSS       ResourceType = "oss"
	ResourceS3        ResourceType = "s3"
	ResourceEBS       ResourceType = "ebs"
	ResourceDisk      ResourceType = "disk"
	ResourceSecurityGroup ResourceType = "security_group"
)

type RiskLevel string

const (
	RiskCritical RiskLevel = "CRITICAL"
	RiskHigh     RiskLevel = "HIGH"
	RiskMedium   RiskLevel = "MEDIUM"
	RiskLow      RiskLevel = "LOW"
)

type RiskCategory string

const (
	RiskUnusedResource  RiskCategory = "unused_resource"
	RiskOpenSecurityGroup RiskCategory = "open_security_group"
	RiskUnencryptedDisk RiskCategory = "unencrypted_disk"
	RiskUnencryptedStorage RiskCategory = "unencrypted_storage"
)

type AccountConfig struct {
	Name      string        `json:"name" yaml:"name"`
	Provider  CloudProvider `json:"provider" yaml:"provider"`
	Region    string        `json:"region" yaml:"region"`
	AccessKey string        `json:"access_key" yaml:"access_key"`
	SecretKey string        `json:"secret_key" yaml:"secret_key"`
	RoleArn   string        `json:"role_arn,omitempty" yaml:"role_arn,omitempty"`
}

type Config struct {
	Accounts []AccountConfig `json:"accounts" yaml:"accounts"`
}

type Resource struct {
	Provider   CloudProvider `json:"provider"`
	Type       ResourceType  `json:"type"`
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Region     string        `json:"region"`
	Account    string        `json:"account"`
	Status     string        `json:"status"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type RiskItem struct {
	Provider   CloudProvider `json:"provider"`
	Category   RiskCategory  `json:"category"`
	Level      RiskLevel     `json:"level"`
	ResourceID string        `json:"resource_id"`
	ResourceType ResourceType `json:"resource_type"`
	ResourceName string      `json:"resource_name"`
	Region     string        `json:"region"`
	Account    string        `json:"account"`
	Message    string        `json:"message"`
	Details    map[string]interface{} `json:"details,omitempty"`
}

type ScanResult struct {
	Account   string         `json:"account"`
	Provider  CloudProvider  `json:"provider"`
	Resources []Resource     `json:"resources"`
	Risks     []RiskItem     `json:"risks"`
}

type Report struct {
	GeneratedAt string       `json:"generated_at"`
	Summary     ReportSummary `json:"summary"`
	Results     []ScanResult `json:"results"`
}

type ReportSummary struct {
	TotalResources int        `json:"total_resources"`
	TotalRisks     int        `json:"total_risks"`
	RiskByLevel    map[RiskLevel]int `json:"risk_by_level"`
	RiskByCategory map[RiskCategory]int `json:"risk_by_category"`
}
