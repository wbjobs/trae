package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
)

type GameServerPhase string

const (
	GameServerPhaseRunning     GameServerPhase = "Running"
	GameServerPhaseUpgrading   GameServerPhase = "Upgrading"
	GameServerPhaseMigrating   GameServerPhase = "Migrating"
	GameServerPhaseDraining    GameServerPhase = "Draining"
	GameServerPhaseCanary      GameServerPhase = "Canary"
	GameServerPhaseSucceeded   GameServerPhase = "Succeeded"
	GameServerPhaseFailed      GameServerPhase = "Failed"
	GameServerPhaseRollingBack GameServerPhase = "RollingBack"
)

type UpgradeStrategy string

const (
	UpgradeStrategyInPlace UpgradeStrategy = "InPlace"
)

type MigrationState string

const (
	MigrationStatePending   MigrationState = "Pending"
	MigrationStateMigrating MigrationState = "Migrating"
	MigrationStateCompleted MigrationState = "Completed"
	MigrationStateFailed    MigrationState = "Failed"
)

type GameServerSpec struct {
	GameName     string              `json:"gameName"`
	ServerID     string              `json:"serverId"`
	Replicas     int32               `json:"replicas"`
	Template     GameServerTemplate  `json:"template"`
	UpgradePolicy UpgradePolicy      `json:"upgradePolicy,omitempty"`
}

type GameServerTemplate struct {
	Containers []GameServerContainer `json:"containers"`
}

type GameServerContainer struct {
	Name  string `json:"name"`
	Image string `json:"image"`
}

type UpgradePolicy struct {
	Strategy              UpgradeStrategy            `json:"strategy"`
	MaxUnavailable        *intstr.IntOrString        `json:"maxUnavailable,omitempty"`
	MigrationTimeoutSeconds int32                    `json:"migrationTimeoutSeconds,omitempty"`
	AgentPort             int32                      `json:"agentPort,omitempty"`
	Canary                *CanaryPolicy              `json:"canary,omitempty"`
}

type CanaryPolicy struct {
	Enable                bool              `json:"enable"`
	CanaryReplicas        *intstr.IntOrString `json:"canaryReplicas,omitempty"`
	CanaryPercentage      int32             `json:"canaryPercentage,omitempty"`
	ObservationDuration   int32             `json:"observationDurationSeconds,omitempty"`
	AutoDecision          bool              `json:"autoDecision,omitempty"`
	MaxCPUDeviation       float64           `json:"maxCPUDeviation,omitempty"`
	MaxMemoryDeviation    float64           `json:"maxMemoryDeviation,omitempty"`
	MaxPlayerLossPercent  float64           `json:"maxPlayerLossPercent,omitempty"`
	MinPlayerCount        int32             `json:"minPlayerCount,omitempty"`
}

type CanaryDecision string

const (
	CanaryDecisionPending  CanaryDecision = "Pending"
	CanaryDecisionPromote  CanaryDecision = "Promote"
	CanaryDecisionRollback CanaryDecision = "Rollback"
	CanaryDecisionObserve  CanaryDecision = "Observe"
)

type PlayerMigration struct {
	PlayerID     string            `json:"playerId"`
	PlayerName   string            `json:"playerName"`
	Level        int32             `json:"level"`
	DataSize     int64             `json:"dataSize"`
	MigrateTime  *metav1.Time      `json:"migrateTime,omitempty"`
	Status       string            `json:"status"`
	ErrorMessage string            `json:"errorMessage,omitempty"`
}

type GameServerStatus struct {
	Phase              GameServerPhase      `json:"phase,omitempty"`
	CurrentVersion     string               `json:"currentVersion,omitempty"`
	TargetVersion      string               `json:"targetVersion,omitempty"`
	ReadyReplicas      int32                `json:"readyReplicas,omitempty"`
	UpdatedReplicas    int32                `json:"updatedReplicas,omitempty"`
	TotalReplicas      int32                `json:"totalReplicas,omitempty"`
	OnlinePlayers      int32                `json:"onlinePlayers,omitempty"`
	MigrationStatus    *MigrationStatus     `json:"migrationStatus,omitempty"`
	UpgradeProgress    *UpgradeProgress     `json:"upgradeProgress,omitempty"`
	CanaryStatus       *CanaryStatus        `json:"canaryStatus,omitempty"`
	Conditions         []GameServerCondition `json:"conditions,omitempty"`
	LastUpdateTime     *metav1.Time         `json:"lastUpdateTime,omitempty"`
}

type CanaryStatus struct {
	Phase             string              `json:"phase"`
	CanaryReplicas    int32               `json:"canaryReplicas"`
	StableReplicas    int32               `json:"stableReplicas"`
	ObservationStart  *metav1.Time        `json:"observationStart,omitempty"`
	ObservationEnd    *metav1.Time        `json:"observationEnd,omitempty"`
	Decision          CanaryDecision      `json:"decision"`
	DecisionReason    string              `json:"decisionReason,omitempty"`
	MetricsComparison *MetricsComparison  `json:"metricsComparison,omitempty"`
	CanaryPods        []PodMetrics        `json:"canaryPods,omitempty"`
	StablePods        []PodMetrics        `json:"stablePods,omitempty"`
}

type MetricsComparison struct {
	CanaryAvgCPU       float64 `json:"canaryAvgCPU"`
	StableAvgCPU       float64 `json:"stableAvgCPU"`
	CPUDeviation       float64 `json:"cpuDeviation"`
	CanaryAvgMemory    float64 `json:"canaryAvgMemory"`
	StableAvgMemory    float64 `json:"stableAvgMemory"`
	MemoryDeviation    float64 `json:"memoryDeviation"`
	CanaryAvgPlayers   int32   `json:"canaryAvgPlayers"`
	StableAvgPlayers   int32   `json:"stableAvgPlayers"`
	PlayerLossPercent  float64 `json:"playerLossPercent"`
	ComparisonTime     *metav1.Time `json:"comparisonTime,omitempty"`
	OverallHealthScore float64 `json:"overallHealthScore"`
}

type PodMetrics struct {
	PodName       string  `json:"podName"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryPercent float64 `json:"memoryPercent"`
	MemoryRSS     int64   `json:"memoryRSS"`
	OnlinePlayers int32   `json:"onlinePlayers"`
	Timestamp     *metav1.Time `json:"timestamp,omitempty"`
}

type MigrationStatus struct {
	State           MigrationState    `json:"state"`
	TotalPlayers    int32             `json:"totalPlayers"`
	MigratedPlayers int32             `json:"migratedPlayers"`
	FailedPlayers   int32             `json:"failedPlayers"`
	SourcePod       string            `json:"sourcePod,omitempty"`
	TargetPod       string            `json:"targetPod,omitempty"`
	StartTime       *metav1.Time      `json:"startTime,omitempty"`
	EndTime         *metav1.Time      `json:"endTime,omitempty"`
	Players         []PlayerMigration `json:"players,omitempty"`
}

type UpgradeProgress struct {
	TotalPods       int32  `json:"totalPods"`
	UpgradedPods    int32  `json:"upgradedPods"`
	CurrentPodIndex int32  `json:"currentPodIndex"`
	Percentage      int32  `json:"percentage"`
	EstimatedTime   string `json:"estimatedTime,omitempty"`
	StartTime       *metav1.Time `json:"startTime,omitempty"`
}

type GameServerCondition struct {
	Type               string      `json:"type"`
	Status             string      `json:"status"`
	LastTransitionTime metav1.Time `json:"lastTransitionTime,omitempty"`
	Reason             string      `json:"reason,omitempty"`
	Message            string      `json:"message,omitempty"`
}

type GameServer struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   GameServerSpec   `json:"spec,omitempty"`
	Status GameServerStatus `json:"status,omitempty"`
}

type GameServerList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []GameServer `json:"items"`
}
