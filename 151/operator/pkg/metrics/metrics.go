package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"sigs.k8s.io/controller-runtime/pkg/metrics"
)

var (
	GameServerUpgradeTotal = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gameserver_upgrade_total",
			Help: "Total number of GameServer upgrades",
		},
		[]string{"namespace", "name", "phase"},
	)

	GameServerUpgradeProgress = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gameserver_upgrade_progress_percentage",
			Help: "GameServer upgrade progress percentage",
		},
		[]string{"namespace", "name"},
	)

	GameServerOnlinePlayers = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gameserver_online_players",
			Help: "Number of online players in GameServer",
		},
		[]string{"namespace", "name"},
	)

	GameServerMigrationPlayers = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gameserver_migration_players",
			Help: "Number of players being migrated",
		},
		[]string{"namespace", "name", "status"},
	)

	GameServerReplicas = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gameserver_replicas",
			Help: "Number of GameServer replicas",
		},
		[]string{"namespace", "name", "type"},
	)

	GameServerUpgradeDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gameserver_upgrade_duration_seconds",
			Help:    "Duration of GameServer upgrades in seconds",
			Buckets: prometheus.ExponentialBuckets(60, 2, 10),
		},
		[]string{"namespace", "name"},
	)
)

func RegisterMetrics() {
	metrics.Registry.MustRegister(
		GameServerUpgradeTotal,
		GameServerUpgradeProgress,
		GameServerOnlinePlayers,
		GameServerMigrationPlayers,
		GameServerReplicas,
		GameServerUpgradeDuration,
	)
}

func UpdateGameServerMetrics(namespace, name string, phase string, progress float64, onlinePlayers int32, migratedPlayers, failedPlayers, totalPlayers int32) {
	GameServerUpgradeTotal.WithLabelValues(namespace, name, phase).Set(1)
	GameServerUpgradeProgress.WithLabelValues(namespace, name).Set(progress)
	GameServerOnlinePlayers.WithLabelValues(namespace, name).Set(float64(onlinePlayers))
	GameServerMigrationPlayers.WithLabelValues(namespace, name, "migrated").Set(float64(migratedPlayers))
	GameServerMigrationPlayers.WithLabelValues(namespace, name, "failed").Set(float64(failedPlayers))
	GameServerMigrationPlayers.WithLabelValues(namespace, name, "total").Set(float64(totalPlayers))
}

func UpdateGameServerReplicaMetrics(namespace, name string, ready, updated, total int32) {
	GameServerReplicas.WithLabelValues(namespace, name, "ready").Set(float64(ready))
	GameServerReplicas.WithLabelValues(namespace, name, "updated").Set(float64(updated))
	GameServerReplicas.WithLabelValues(namespace, name, "total").Set(float64(total))
}
