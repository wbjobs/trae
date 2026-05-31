package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type DatabaseBackupSpec struct {
	MySQLHost     string `json:"mysqlHost"`
	MySQLPort     int    `json:"mysqlPort,omitempty"`
	MySQLUser     string `json:"mysqlUser"`
	MySQLPassword string `json:"mysqlPassword"`
	MySQLDatabase string `json:"mysqlDatabase"`
	Schedule      string `json:"schedule,omitempty"`
	RetentionDays int    `json:"retentionDays,omitempty"`
	S3Bucket      string `json:"s3Bucket"`
	S3Endpoint    string `json:"s3Endpoint"`
	S3AccessKey   string `json:"s3AccessKey"`
	S3SecretKey   string `json:"s3SecretKey"`
	S3UseSSL      bool   `json:"s3UseSSL,omitempty"`
}

type BackupStatus string

const (
	BackupStatusPending   BackupStatus = "Pending"
	BackupStatusRunning   BackupStatus = "Running"
	BackupStatusCompleted BackupStatus = "Completed"
	BackupStatusFailed    BackupStatus = "Failed"
)

type BackupRecord struct {
	Name       string       `json:"name"`
	Size       int64        `json:"size"`
	Status     BackupStatus `json:"status"`
	StartTime  metav1.Time  `json:"startTime"`
	FinishTime *metav1.Time `json:"finishTime,omitempty"`
	S3Path     string       `json:"s3Path,omitempty"`
	Error      string       `json:"error,omitempty"`
}

type PreCheckResult struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Duration string `json:"duration,omitempty"`
}

type PreCheckReport struct {
	Passed    bool              `json:"passed"`
	CheckedAt metav1.Time       `json:"checkedAt"`
	Results   []PreCheckResult  `json:"results"`
	Estimated string            `json:"estimatedDuration,omitempty"`
	DBSize    string            `json:"dbSize,omitempty"`
}

type DatabaseBackupStatus struct {
	LastBackupTime  *metav1.Time    `json:"lastBackupTime,omitempty"`
	NextBackupTime  *metav1.Time    `json:"nextBackupTime,omitempty"`
	CurrentStatus   BackupStatus    `json:"currentStatus,omitempty"`
	BackupHistory   []BackupRecord  `json:"backupHistory,omitempty"`
	RetryCount      int             `json:"retryCount,omitempty"`
	LastError       string          `json:"lastError,omitempty"`
	LastPreCheck    *PreCheckReport `json:"lastPreCheck,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

type DatabaseBackup struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   DatabaseBackupSpec   `json:"spec,omitempty"`
	Status DatabaseBackupStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

type DatabaseBackupList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []DatabaseBackup `json:"items"`
}
