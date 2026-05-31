package upgrade

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/client"

	gamev1alpha1 "gameserver-operator/api/v1alpha1"
	"gameserver-operator/pkg/agent"
	"gameserver-operator/pkg/metrics"

	corev1 "k8s.io/api/core/v1"
	kruiseappsv1alpha1 "github.com/openkruise/kruise-api/apps/v1alpha1"
)

const (
	defaultDrainTimeout    = 60 * time.Second
	defaultShutdownTimeout = 30 * time.Second
	defaultPortTimeout     = 30 * time.Second
	defaultForceKillDelay  = 10 * time.Second
)

type Manager struct {
	client    client.Client
	recorder  record.EventRecorder
	log       logr.Logger
}

func NewManager(c client.Client, recorder record.EventRecorder, log logr.Logger) *Manager {
	return &Manager{
		client:   c,
		recorder: recorder,
		log:      log,
	}
}

func (m *Manager) ReconcileUpgrade(ctx context.Context, gs *gamev1alpha1.GameServer) error {
	log := m.log.WithValues("gameserver", types.NamespacedName{Namespace: gs.Namespace, Name: gs.Name})

	if gs.Status.Phase == "" {
		return m.initializeStatus(ctx, gs)
	}

	if needsUpgrade(gs) {
		return m.performUpgrade(ctx, gs, log)
	}

	return nil
}

func needsUpgrade(gs *gamev1alpha1.GameServer) bool {
	if gs.Status.CurrentVersion == "" {
		return true
	}

	for _, container := range gs.Spec.Template.Containers {
		if container.Image != gs.Status.CurrentVersion {
			return true
		}
	}

	return false
}

func (m *Manager) initializeStatus(ctx context.Context, gs *gamev1alpha1.GameServer) error {
	now := metav1.Now()
	gs.Status.Phase = gamev1alpha1.GameServerPhaseRunning
	gs.Status.CurrentVersion = gs.Spec.Template.Containers[0].Image
	gs.Status.TargetVersion = gs.Spec.Template.Containers[0].Image
	gs.Status.TotalReplicas = gs.Spec.Replicas
	gs.Status.ReadyReplicas = 0
	gs.Status.UpdatedReplicas = 0
	gs.Status.OnlinePlayers = 0
	gs.Status.LastUpdateTime = &now

	gs.Status.Conditions = []gamev1alpha1.GameServerCondition{
		{
			Type:               "Initialized",
			Status:             "True",
			LastTransitionTime: now,
			Reason:             "GameServerInitialized",
			Message:            "GameServer has been initialized",
		},
	}

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) performUpgrade(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	now := metav1.Now()

	switch gs.Status.Phase {
	case gamev1alpha1.GameServerPhaseRunning, "":
		canaryPolicy := gs.Spec.UpgradePolicy.Canary
		if canaryPolicy != nil && canaryPolicy.Enable {
			gs.Status.Phase = gamev1alpha1.GameServerPhaseCanary
			gs.Status.TargetVersion = gs.Spec.Template.Containers[0].Image
			gs.Status.UpgradeProgress = &gamev1alpha1.UpgradeProgress{
				TotalPods:       gs.Spec.Replicas,
				UpgradedPods:    0,
				CurrentPodIndex: 0,
				Percentage:      0,
				StartTime:       &now,
			}

			canaryReplicas := m.calculateCanaryReplicas(gs)
			gs.Status.CanaryStatus = &gamev1alpha1.CanaryStatus{
				Phase:          "Preparing",
				CanaryReplicas: canaryReplicas,
				StableReplicas: gs.Spec.Replicas - canaryReplicas,
				Decision:       gamev1alpha1.CanaryDecisionPending,
			}
			gs.Status.LastUpdateTime = &now
			gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
				Type:               "CanaryUpgradeStarted",
				Status:             "True",
				LastTransitionTime: now,
				Reason:             "CanaryUpgrade",
				Message:            fmt.Sprintf("Starting canary upgrade with %d canary replicas", canaryReplicas),
			})

			m.recorder.Event(gs, "Normal", "CanaryUpgradeStarted", fmt.Sprintf("Canary upgrade started, %d replicas for canary", canaryReplicas))
			log.Info("Starting canary upgrade", "canaryReplicas", canaryReplicas, "stableReplicas", gs.Spec.Replicas-canaryReplicas)
		} else {
			gs.Status.Phase = gamev1alpha1.GameServerPhaseUpgrading
			gs.Status.TargetVersion = gs.Spec.Template.Containers[0].Image
			gs.Status.UpgradeProgress = &gamev1alpha1.UpgradeProgress{
				TotalPods:       gs.Spec.Replicas,
				UpgradedPods:    0,
				CurrentPodIndex: 0,
				Percentage:      0,
				StartTime:       &now,
			}
			gs.Status.LastUpdateTime = &now
			gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
				Type:               "UpgradeStarted",
				Status:             "True",
				LastTransitionTime: now,
				Reason:             "UpgradeInProgress",
				Message:            "Starting in-place upgrade",
			})

			m.recorder.Event(gs, "Normal", "UpgradeStarted", "Starting in-place upgrade to version "+gs.Spec.Template.Containers[0].Image)
			log.Info("Starting upgrade", "targetVersion", gs.Spec.Template.Containers[0].Image)
		}
		return m.client.Status().Update(ctx, gs)

	case gamev1alpha1.GameServerPhaseUpgrading:
		return m.processUpgradePods(ctx, gs, log)

	case gamev1alpha1.GameServerPhaseMigrating:
		return m.checkMigrationStatus(ctx, gs, log)

	case gamev1alpha1.GameServerPhaseDraining:
		return m.processDraining(ctx, gs, log)

	case gamev1alpha1.GameServerPhaseCanary:
		return m.processCanaryUpgrade(ctx, gs, log)

	case gamev1alpha1.GameServerPhaseRollingBack:
		return m.processRollback(ctx, gs, log)
	}

	return nil
}

func (m *Manager) processUpgradePods(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return fmt.Errorf("failed to get GameServer pods: %w", err)
	}

	if len(pods) == 0 {
		log.Info("No pods found, waiting for pods to be created")
		return nil
	}

	if gs.Status.UpgradeProgress.CurrentPodIndex >= gs.Status.UpgradeProgress.TotalPods {
		return m.completeUpgrade(ctx, gs, log)
	}

	currentPodIndex := gs.Status.UpgradeProgress.CurrentPodIndex
	if currentPodIndex >= int32(len(pods)) {
		return nil
	}

	targetPod := pods[currentPodIndex]

	if isPodUpgraded(&targetPod, gs.Spec.Template.Containers[0].Image) {
		gs.Status.UpgradeProgress.CurrentPodIndex++
		gs.Status.UpgradeProgress.UpgradedPods++
		gs.Status.UpdatedReplicas++
		gs.Status.UpgradeProgress.Percentage = int32(float64(gs.Status.UpgradeProgress.UpgradedPods) / float64(gs.Status.UpgradeProgress.TotalPods) * 100)
		gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

		if gs.Status.UpgradeProgress.UpgradedPods >= gs.Status.UpgradeProgress.TotalPods {
			return m.completeUpgrade(ctx, gs, log)
		}

		return m.client.Status().Update(ctx, gs)
	}

	gs.Status.Phase = gamev1alpha1.GameServerPhaseMigrating
	gs.Status.MigrationStatus = &gamev1alpha1.MigrationStatus{
		State:        gamev1alpha1.MigrationStatePending,
		TotalPlayers: 0,
		SourcePod:    targetPod.Name,
		StartTime:    &metav1.Time{Time: time.Now()},
	}
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	log.Info("Starting migration for pod", "pod", targetPod.Name)
	m.recorder.Event(gs, "Normal", "MigrationStarted", "Starting migration for pod "+targetPod.Name)

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) checkMigrationStatus(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	if gs.Status.MigrationStatus == nil {
		gs.Status.Phase = gamev1alpha1.GameServerPhaseUpgrading
		return m.client.Status().Update(ctx, gs)
	}

	if gs.Status.MigrationStatus.State == gamev1alpha1.MigrationStateCompleted {
		gs.Status.Phase = gamev1alpha1.GameServerPhaseDraining
		gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

		now := metav1.Now()
		gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
			Type:               "DrainingStarted",
			Status:             "True",
			LastTransitionTime: now,
			Reason:             "ServerDraining",
			Message:            "Draining game server to release ports",
		})

		m.recorder.Event(gs, "Normal", "DrainingStarted", "Starting drain for pod "+gs.Status.MigrationStatus.SourcePod)
		log.Info("Starting drain for pod", "pod", gs.Status.MigrationStatus.SourcePod)

		go m.executeDrainAndShutdown(ctx, gs, log)

		return m.client.Status().Update(ctx, gs)
	}

	if gs.Status.MigrationStatus.State == gamev1alpha1.MigrationStatePending {
		return m.startMigration(ctx, gs, log)
	}

	return nil
}

func (m *Manager) startMigration(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	agentPort := gs.Spec.UpgradePolicy.AgentPort
	if agentPort == 0 {
		agentPort = 8080
	}

	sourceURL := fmt.Sprintf("http://%s.%s:%d", gs.Status.MigrationStatus.SourcePod, gs.Namespace, agentPort)
	sourceAgent := agent.NewClient(sourceURL)

	players, err := sourceAgent.GetPlayers(ctx)
	if err != nil {
		log.Error(err, "Failed to get players from source pod")
		gs.Status.MigrationStatus.State = gamev1alpha1.MigrationStateFailed
		return m.client.Status().Update(ctx, gs)
	}

	gs.Status.MigrationStatus.State = gamev1alpha1.MigrationStateMigrating
	gs.Status.MigrationStatus.TotalPlayers = players.Total
	gs.Status.MigrationStatus.Players = make([]gamev1alpha1.PlayerMigration, 0)

	for _, p := range players.Players {
		gs.Status.MigrationStatus.Players = append(gs.Status.MigrationStatus.Players, gamev1alpha1.PlayerMigration{
			PlayerID:   p.PlayerID,
			PlayerName: p.PlayerName,
			Level:      p.Level,
			DataSize:   p.DataSize,
			Status:     "migrating",
		})
	}

	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	log.Info("Migration started", "totalPlayers", players.Total)
	m.recorder.Event(gs, "Normal", "MigrationProgress", fmt.Sprintf("Migrating %d players", players.Total))

	metrics.UpdateGameServerMetrics(
		gs.Namespace,
		gs.Name,
		string(gs.Status.Phase),
		float64(gs.Status.UpgradeProgress.Percentage),
		gs.Status.OnlinePlayers,
		gs.Status.MigrationStatus.MigratedPlayers,
		gs.Status.MigrationStatus.FailedPlayers,
		gs.Status.MigrationStatus.TotalPlayers,
	)

	go m.performPlayerMigration(ctx, gs, sourceAgent, players.Players, log)

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) performPlayerMigration(ctx context.Context, gs *gamev1alpha1.GameServer, sourceAgent *agent.Client, players []agent.PlayerData, log logr.Logger) {
	migratedCount := int32(0)
	failedCount := int32(0)

	for i := range players {
		player := players[i]
		playerData, err := sourceAgent.ExportPlayerData(ctx, player.PlayerID)
		if err != nil {
			log.Error(err, "Failed to export player data", "playerId", player.PlayerID)
			failedCount++
			continue
		}

		now := metav1.Now()
		for j := range gs.Status.MigrationStatus.Players {
			if gs.Status.MigrationStatus.Players[j].PlayerID == player.PlayerID {
				gs.Status.MigrationStatus.Players[j].Status = "completed"
				gs.Status.MigrationStatus.Players[j].MigrateTime = &now
				break
			}
		}
		migratedCount++
	}

	gs.Status.MigrationStatus.MigratedPlayers = migratedCount
	gs.Status.MigrationStatus.FailedPlayers = failedCount
	gs.Status.MigrationStatus.State = gamev1alpha1.MigrationStateCompleted
	gs.Status.MigrationStatus.EndTime = &metav1.Time{Time: time.Now()}
	gs.Status.OnlinePlayers = 0
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	now := metav1.Now()
	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "MigrationCompleted",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "MigrationFinished",
		Message:            fmt.Sprintf("Migration completed: %d migrated, %d failed", migratedCount, failedCount),
	})

	log.Info("Migration completed", "migrated", migratedCount, "failed", failedCount)
	m.recorder.Event(gs, "Normal", "MigrationCompleted", fmt.Sprintf("Migration completed: %d migrated, %d failed", migratedCount, failedCount))

	if err := m.client.Status().Update(ctx, gs); err != nil {
		log.Error(err, "Failed to update migration status")
	}
}

func (m *Manager) processDraining(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	if gs.Status.MigrationStatus == nil || gs.Status.MigrationStatus.SourcePod == "" {
		log.Info("No migration status found, proceeding to upgrade")
		if err := m.upgradePodImage(ctx, gs); err != nil {
			log.Error(err, "Failed to upgrade pod image")
			return err
		}
		return m.advanceToNextPod(ctx, gs, log)
	}

	agentPort := gs.Spec.UpgradePolicy.AgentPort
	if agentPort == 0 {
		agentPort = 8080
	}

	sourceURL := fmt.Sprintf("http://%s.%s:%d", gs.Status.MigrationStatus.SourcePod, gs.Namespace, agentPort)
	sourceAgent := agent.NewClient(sourceURL)

	portCheck, err := sourceAgent.CheckPortsReleased(ctx)
	if err != nil {
		log.V(1).Info("Port check failed, ports may still be in use", "error", err)
		return nil
	}

	if portCheck.AllReleased {
		log.Info("All ports released, proceeding with image upgrade", "pod", gs.Status.MigrationStatus.SourcePod)

		if err := m.upgradePodImage(ctx, gs); err != nil {
			log.Error(err, "Failed to upgrade pod image")
			return err
		}

		return m.advanceToNextPod(ctx, gs, log)
	}

	inUsePorts := make([]int, 0)
	for _, p := range portCheck.Ports {
		if p.InUse {
			inUsePorts = append(inUsePorts, p.Port)
		}
	}
	log.V(1).Info("Waiting for ports to be released", "inUsePorts", inUsePorts)

	return nil
}

func (m *Manager) executeDrainAndShutdown(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) {
	agentPort := gs.Spec.UpgradePolicy.AgentPort
	if agentPort == 0 {
		agentPort = 8080
	}

	migrationTimeout := gs.Spec.UpgradePolicy.MigrationTimeoutSeconds
	if migrationTimeout == 0 {
		migrationTimeout = 300
	}

	sourceURL := fmt.Sprintf("http://%s.%s:%d", gs.Status.MigrationStatus.SourcePod, gs.Namespace, agentPort)
	sourceAgent := agent.NewClient(sourceURL)

	drainTimeout := defaultDrainTimeout
	if migrationTimeout < 60 {
		drainTimeout = time.Duration(migrationTimeout/2) * time.Second
	}

	log.Info("Step 1: Starting drain - stopping new connections")
	if _, err := sourceAgent.StartDrain(ctx, int32(drainTimeout.Seconds())); err != nil {
		log.Error(err, "Failed to start drain")
		m.handleDrainFailure(ctx, gs, log, "drain_failed", fmt.Sprintf("Failed to start drain: %v", err))
		return
	}

	log.Info("Step 2: Waiting for drain to complete")
	if err := sourceAgent.WaitForDrainComplete(ctx, drainTimeout); err != nil {
		log.V(1).Info("Drain wait timed out, proceeding with shutdown anyway", "error", err)
	}

	log.Info("Step 3: Sending SIGTERM to game server process")
	if err := sourceAgent.SendShutdownSignal(ctx); err != nil {
		log.Error(err, "Failed to send shutdown signal")
		m.handleDrainFailure(ctx, gs, log, "shutdown_signal_failed", fmt.Sprintf("Failed to send shutdown signal: %v", err))
		return
	}

	log.Info("Step 4: Waiting for process to exit")
	shutdownTimeout := defaultShutdownTimeout
	if err := sourceAgent.WaitForProcessExit(ctx, shutdownTimeout); err != nil {
		log.V(1).Info("Process did not exit gracefully, sending SIGKILL", "error", err)
		if err := sourceAgent.SendForceKill(ctx); err != nil {
			log.Error(err, "Failed to send force kill")
		}
		time.Sleep(defaultForceKillDelay)
	}

	log.Info("Step 5: Verifying all game ports are released")
	portTimeout := defaultPortTimeout
	if err := sourceAgent.WaitForPortsReleased(ctx, portTimeout); err != nil {
		log.Error(err, "Ports not released after timeout")
		m.handleDrainFailure(ctx, gs, log, "port_release_timeout", "Ports not released within timeout")
		return
	}

	portCheck, err := sourceAgent.CheckPortsReleased(ctx)
	if err != nil {
		log.Error(err, "Failed to verify port release")
		m.handleDrainFailure(ctx, gs, log, "port_check_failed", fmt.Sprintf("Failed to verify port release: %v", err))
		return
	}

	if !portCheck.AllReleased {
		log.Error(fmt.Errorf("ports still in use"), "Not all ports released")
		m.handleDrainFailure(ctx, gs, log, "ports_in_use", "Not all game ports released")
		return
	}

	releasedPorts := make([]int, 0)
	for _, p := range portCheck.Ports {
		releasedPorts = append(releasedPorts, p.Port)
	}

	log.Info("All ports released successfully", "ports", releasedPorts)

	now := metav1.Now()
	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "PortsReleased",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "AllPortsReleased",
		Message:            fmt.Sprintf("All game ports released: %v", releasedPorts),
	})

	m.recorder.Event(gs, "Normal", "PortsReleased", fmt.Sprintf("All game ports released: %v", releasedPorts))

	if err := m.client.Status().Update(ctx, gs); err != nil {
		log.Error(err, "Failed to update status after port release")
	}
}

func (m *Manager) handleDrainFailure(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger, reason, message string) {
	gs.Status.Phase = gamev1alpha1.GameServerPhaseFailed
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	now := metav1.Now()
	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "UpgradeFailed",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             reason,
		Message:            message,
	})

	m.recorder.Event(gs, "Warning", "UpgradeFailed", message)
	log.Error(fmt.Errorf(message), "Upgrade failed during drain/shutdown phase")

	if err := m.client.Status().Update(ctx, gs); err != nil {
		log.Error(err, "Failed to update failure status")
	}
}

func (m *Manager) upgradePodImage(ctx context.Context, gs *gamev1alpha1.GameServer) error {
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return err
	}

	currentPodIndex := gs.Status.UpgradeProgress.CurrentPodIndex
	if currentPodIndex >= int32(len(pods)) {
		return nil
	}

	targetPod := &pods[currentPodIndex]
	targetPod.Spec.Containers[0].Image = gs.Spec.Template.Containers[0].Image

	if err := m.client.Update(ctx, targetPod); err != nil {
		return fmt.Errorf("failed to update pod image: %w", err)
	}

	return nil
}

func (m *Manager) advanceToNextPod(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	gs.Status.UpgradeProgress.CurrentPodIndex++
	gs.Status.UpgradeProgress.UpgradedPods++
	gs.Status.UpdatedReplicas++
	gs.Status.UpgradeProgress.Percentage = int32(float64(gs.Status.UpgradeProgress.UpgradedPods) / float64(gs.Status.UpgradeProgress.TotalPods) * 100)
	gs.Status.Phase = gamev1alpha1.GameServerPhaseUpgrading
	gs.Status.MigrationStatus = nil
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	if gs.Status.UpgradeProgress.UpgradedPods >= gs.Status.UpgradeProgress.TotalPods {
		return m.completeUpgrade(ctx, gs, log)
	}

	m.recorder.Event(gs, "Normal", "PodUpgraded", fmt.Sprintf("Pod %d/%d upgraded successfully", gs.Status.UpgradeProgress.CurrentPodIndex, gs.Status.UpgradeProgress.TotalPods))
	log.Info("Pod upgraded, advancing to next pod", "podIndex", gs.Status.UpgradeProgress.CurrentPodIndex)

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) completeUpgrade(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	now := metav1.Now()
	gs.Status.Phase = gamev1alpha1.GameServerPhaseSucceeded
	gs.Status.CurrentVersion = gs.Spec.Template.Containers[0].Image
	gs.Status.UpgradeProgress.Percentage = 100
	gs.Status.UpdatedReplicas = gs.Spec.Replicas
	gs.Status.ReadyReplicas = gs.Spec.Replicas
	gs.Status.MigrationStatus = nil
	gs.Status.LastUpdateTime = &now

	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "UpgradeCompleted",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "UpgradeSucceeded",
		Message:            "In-place upgrade completed successfully",
	})

	m.recorder.Event(gs, "Normal", "UpgradeCompleted", "In-place upgrade completed successfully")
	log.Info("Upgrade completed successfully")

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) getGameServerPods(ctx context.Context, gs *gamev1alpha1.GameServer) ([]corev1.Pod, error) {
	var podList corev1.PodList
	labels := map[string]string{
		"game.kruise.io/gameserver": gs.Name,
	}

	if err := m.client.List(ctx, &podList, client.InNamespace(gs.Namespace), client.MatchingLabels(labels)); err != nil {
		return nil, err
	}

	return podList.Items, nil
}

func isPodUpgraded(pod *corev1.Pod, targetImage string) bool {
	for _, container := range pod.Spec.Containers {
		if container.Name == "gameserver" {
			return container.Image == targetImage
		}
	}
	return false
}

func (m *Manager) UpdateKruiseWorkload(ctx context.Context, gs *gamev1alpha1.GameServer) error {
	var clonesetList kruiseappsv1alpha1.CloneSetList
	labels := map[string]string{
		"game.kruise.io/gameserver": gs.Name,
	}

	if err := m.client.List(ctx, &clonesetList, client.InNamespace(gs.Namespace), client.MatchingLabels(labels)); err != nil {
		return err
	}

	for i := range clonesetList.Items {
		cloneset := &clonesetList.Items[i]
		cloneset.Spec.Template.Spec.Containers[0].Image = gs.Spec.Template.Containers[0].Image
		cloneset.Spec.UpdateStrategy.Type = kruiseappsv1alpha1.InPlaceOnlyPodUpdateStrategyType

		if err := m.client.Update(ctx, cloneset); err != nil {
			return fmt.Errorf("failed to update cloneset: %w", err)
		}
	}

	return nil
}

func (m *Manager) calculateCanaryReplicas(gs *gamev1alpha1.GameServer) int32 {
	canaryPolicy := gs.Spec.UpgradePolicy.Canary
	if canaryPolicy == nil {
		return 1
	}

	if canaryPolicy.CanaryReplicas != nil {
		replicas, _ := intstr.GetScaledValueFromIntOrPercent(canaryPolicy.CanaryReplicas, int(gs.Spec.Replicas), false)
		if replicas <= 0 {
			replicas = 1
		}
		return int32(replicas)
	}

	percentage := canaryPolicy.CanaryPercentage
	if percentage <= 0 {
		percentage = 10
	}

	canaryReplicas := gs.Spec.Replicas * int32(percentage) / 100
	if canaryReplicas <= 0 {
		canaryReplicas = 1
	}
	if canaryReplicas >= gs.Spec.Replicas {
		canaryReplicas = gs.Spec.Replicas - 1
	}

	return canaryReplicas
}

func (m *Manager) processCanaryUpgrade(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	if gs.Status.CanaryStatus == nil {
		gs.Status.Phase = gamev1alpha1.GameServerPhaseUpgrading
		return m.client.Status().Update(ctx, gs)
	}

	switch gs.Status.CanaryStatus.Phase {
	case "Preparing":
		return m.startCanaryUpgrade(ctx, gs, log)
	case "Observing":
		return m.observeCanary(ctx, gs, log)
	case "Deciding":
		return m.makeCanaryDecision(ctx, gs, log)
	case "Promoting":
		return m.promoteCanaryToFull(ctx, gs, log)
	case "RollingBack":
		return m.rollbackCanary(ctx, gs, log)
	case "Completed":
		return m.completeUpgrade(ctx, gs, log)
	}

	return nil
}

func (m *Manager) startCanaryUpgrade(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return fmt.Errorf("failed to get GameServer pods: %w", err)
	}

	canaryReplicas := gs.Status.CanaryStatus.CanaryReplicas
	if canaryReplicas > int32(len(pods)) {
		canaryReplicas = int32(len(pods))
	}

	for i := int32(0); i < canaryReplicas; i++ {
		if i >= int32(len(pods)) {
			break
		}
		targetPod := pods[i]
		if !isPodUpgraded(&targetPod, gs.Spec.Template.Containers[0].Image) {
			log.Info("Starting canary upgrade for pod", "pod", targetPod.Name)
			if err := m.upgradeSinglePod(ctx, gs, targetPod.Name); err != nil {
				log.Error(err, "Failed to start canary upgrade for pod", "pod", targetPod.Name)
				continue
			}
		}
	}

	now := metav1.Now()
	gs.Status.CanaryStatus.Phase = "Observing"
	gs.Status.CanaryStatus.ObservationStart = &now
	gs.Status.UpgradeProgress.UpgradedPods = canaryReplicas
	gs.Status.UpgradeProgress.CurrentPodIndex = canaryReplicas
	gs.Status.UpgradeProgress.Percentage = int32(float64(canaryReplicas) / float64(gs.Spec.Replicas) * 100)
	gs.Status.UpdatedReplicas = canaryReplicas
	gs.Status.LastUpdateTime = &now

	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "CanaryObserving",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "CanaryObserving",
		Message:            fmt.Sprintf("Canary pods upgraded, starting observation for %d pods", canaryReplicas),
	})

	m.recorder.Event(gs, "Normal", "CanaryObserving", fmt.Sprintf("Observing %d canary pods", canaryReplicas))

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) observeCanary(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	canaryPolicy := gs.Spec.UpgradePolicy.Canary
	if canaryPolicy == nil {
		gs.Status.CanaryStatus.Phase = "Deciding"
		return m.client.Status().Update(ctx, gs)
	}

	observationDuration := canaryPolicy.ObservationDuration
	if observationDuration <= 0 {
		observationDuration = 300
	}

	observationStart := gs.Status.CanaryStatus.ObservationStart
	if observationStart == nil {
		now := metav1.Now()
		observationStart = &now
		gs.Status.CanaryStatus.ObservationStart = &now
	}

	elapsed := time.Since(observationStart.Time)
	requiredDuration := time.Duration(observationDuration) * time.Second

	if elapsed < requiredDuration {
		remaining := requiredDuration - elapsed
		log.V(1).Info("Still observing canary pods", "elapsed", elapsed.Round(time.Second), "remaining", remaining.Round(time.Second))
		return nil
	}

	now := metav1.Now()
	gs.Status.CanaryStatus.ObservationEnd = &now
	gs.Status.CanaryStatus.Phase = "Deciding"
	gs.Status.LastUpdateTime = &now

	m.recorder.Event(gs, "Normal", "CanaryDeciding", "Canary observation period ended, making decision")

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) makeCanaryDecision(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	canaryPolicy := gs.Spec.UpgradePolicy.Canary
	if canaryPolicy == nil {
		gs.Status.CanaryStatus.Decision = gamev1alpha1.CanaryDecisionPromote
		gs.Status.CanaryStatus.DecisionReason = "No canary policy configured, promoting"
		gs.Status.CanaryStatus.Phase = "Promoting"
		return m.client.Status().Update(ctx, gs)
	}

	metricsComparison, err := m.compareMetrics(ctx, gs, log)
	if err != nil {
		log.Error(err, "Failed to compare metrics, defaulting to promote")
		gs.Status.CanaryStatus.Decision = gamev1alpha1.CanaryDecisionPromote
		gs.Status.CanaryStatus.DecisionReason = "Metrics comparison failed, promoting by default"
		gs.Status.CanaryStatus.Phase = "Promoting"
		return m.client.Status().Update(ctx, gs)
	}

	gs.Status.CanaryStatus.MetricsComparison = metricsComparison

	decision := gamev1alpha1.CanaryDecisionPromote
	reason := "All metrics within acceptable thresholds"

	healthScore := metricsComparison.OverallHealthScore

	if metricsComparison.CPUDeviation > canaryPolicy.MaxCPUDeviation && canaryPolicy.MaxCPUDeviation > 0 {
		decision = gamev1alpha1.CanaryDecisionRollback
		reason = fmt.Sprintf("CPU deviation %.2f%% exceeds threshold %.2f%%", metricsComparison.CPUDeviation*100, canaryPolicy.MaxCPUDeviation*100)
	} else if metricsComparison.MemoryDeviation > canaryPolicy.MaxMemoryDeviation && canaryPolicy.MaxMemoryDeviation > 0 {
		decision = gamev1alpha1.CanaryDecisionRollback
		reason = fmt.Sprintf("Memory deviation %.2f%% exceeds threshold %.2f%%", metricsComparison.MemoryDeviation*100, canaryPolicy.MaxMemoryDeviation*100)
	} else if metricsComparison.PlayerLossPercent > canaryPolicy.MaxPlayerLossPercent && canaryPolicy.MaxPlayerLossPercent > 0 {
		if metricsComparison.CanaryAvgPlayers >= canaryPolicy.MinPlayerCount {
			decision = gamev1alpha1.CanaryDecisionRollback
			reason = fmt.Sprintf("Player loss %.2f%% exceeds threshold %.2f%%", metricsComparison.PlayerLossPercent*100, canaryPolicy.MaxPlayerLossPercent*100)
		}
	}

	if healthScore < 50 {
		decision = gamev1alpha1.CanaryDecisionRollback
		reason = fmt.Sprintf("Overall health score %.2f is below critical threshold 50", healthScore)
	}

	if !canaryPolicy.AutoDecision {
		gs.Status.CanaryStatus.Decision = gamev1alpha1.CanaryDecisionObserve
		gs.Status.CanaryStatus.DecisionReason = "Manual decision required"
		gs.Status.CanaryStatus.Phase = "Deciding"
		gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}
		log.Info("Canary decision pending manual approval", "recommendedDecision", decision, "reason", reason)
		return m.client.Status().Update(ctx, gs)
	}

	gs.Status.CanaryStatus.Decision = decision
	gs.Status.CanaryStatus.DecisionReason = reason
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	if decision == gamev1alpha1.CanaryDecisionPromote {
		gs.Status.CanaryStatus.Phase = "Promoting"
		m.recorder.Event(gs, "Normal", "CanaryDecisionPromote", fmt.Sprintf("Canary decision: Promote - %s", reason))
		log.Info("Canary decision: Promote", "reason", reason, "healthScore", healthScore)
	} else {
		gs.Status.CanaryStatus.Phase = "RollingBack"
		m.recorder.Event(gs, "Warning", "CanaryDecisionRollback", fmt.Sprintf("Canary decision: Rollback - %s", reason))
		log.Info("Canary decision: Rollback", "reason", reason, "healthScore", healthScore)
	}

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) compareMetrics(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) (*gamev1alpha1.MetricsComparison, error) {
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return nil, fmt.Errorf("failed to get pods: %w", err)
	}

	canaryReplicas := gs.Status.CanaryStatus.CanaryReplicas
	agentPort := gs.Spec.UpgradePolicy.AgentPort
	if agentPort == 0 {
		agentPort = 8080
	}

	var canaryMetrics []agent.ResourceMetrics
	var stableMetrics []agent.ResourceMetrics

	for i, pod := range pods {
		agentURL := fmt.Sprintf("http://%s.%s:%d", pod.Name, gs.Namespace, agentPort)
		agentClient := agent.NewClient(agentURL)

		metrics, err := agentClient.GetResourceMetrics(ctx)
		if err != nil {
			log.V(1).Info("Failed to get metrics for pod", "pod", pod.Name, "error", err)
			continue
		}

		if i < int(canaryReplicas) {
			canaryMetrics = append(canaryMetrics, *metrics)
		} else {
			stableMetrics = append(stableMetrics, *metrics)
		}
	}

	if len(canaryMetrics) == 0 || len(stableMetrics) == 0 {
		return nil, fmt.Errorf("insufficient metrics data: canary=%d, stable=%d", len(canaryMetrics), len(stableMetrics))
	}

	canaryAvgCPU := avgFloat(extractCPUPercents(canaryMetrics))
	stableAvgCPU := avgFloat(extractCPUPercents(stableMetrics))
	canaryAvgMemory := avgFloat(extractMemoryPercents(canaryMetrics))
	stableAvgMemory := avgFloat(extractMemoryPercents(stableMetrics))
	canaryAvgPlayers := avgInt(extractPlayerCounts(canaryMetrics))
	stableAvgPlayers := avgInt(extractPlayerCounts(stableMetrics))

	cpuDeviation := float64(0)
	if stableAvgCPU > 0 {
		cpuDeviation = (canaryAvgCPU - stableAvgCPU) / stableAvgCPU
	}

	memoryDeviation := float64(0)
	if stableAvgMemory > 0 {
		memoryDeviation = (canaryAvgMemory - stableAvgMemory) / stableAvgMemory
	}

	playerLossPercent := float64(0)
	if stableAvgPlayers > 0 {
		playerLossPercent = float64(stableAvgPlayers-canaryAvgPlayers) / float64(stableAvgPlayers)
	}

	cpuScore := 100.0
	if cpuDeviation > 0.3 {
		cpuScore = 0
	} else if cpuDeviation > 0.1 {
		cpuScore = 50
	}

	memoryScore := 100.0
	if memoryDeviation > 0.3 {
		memoryScore = 0
	} else if memoryDeviation > 0.1 {
		memoryScore = 50
	}

	playerScore := 100.0
	if playerLossPercent > 0.2 {
		playerScore = 0
	} else if playerLossPercent > 0.1 {
		playerScore = 50
	}

	healthScore := (cpuScore + memoryScore + playerScore) / 3

	now := metav1.Now()

	canaryPodMetrics := make([]gamev1alpha1.PodMetrics, 0, len(canaryMetrics))
	for _, m := range canaryMetrics {
		canaryPodMetrics = append(canaryPodMetrics, gamev1alpha1.PodMetrics{
			PodName:       m.PodName,
			CPUPercent:    m.CPUPercent,
			MemoryPercent: m.MemoryPercent,
			MemoryRSS:     m.MemoryRSS,
			OnlinePlayers: m.OnlinePlayers,
			Timestamp:     &metav1.Time{Time: m.Timestamp},
		})
	}

	stablePodMetrics := make([]gamev1alpha1.PodMetrics, 0, len(stableMetrics))
	for _, m := range stableMetrics {
		stablePodMetrics = append(stablePodMetrics, gamev1alpha1.PodMetrics{
			PodName:       m.PodName,
			CPUPercent:    m.CPUPercent,
			MemoryPercent: m.MemoryPercent,
			MemoryRSS:     m.MemoryRSS,
			OnlinePlayers: m.OnlinePlayers,
			Timestamp:     &metav1.Time{Time: m.Timestamp},
		})
	}

	gs.Status.CanaryStatus.CanaryPods = canaryPodMetrics
	gs.Status.CanaryStatus.StablePods = stablePodMetrics

	return &gamev1alpha1.MetricsComparison{
		CanaryAvgCPU:      canaryAvgCPU,
		StableAvgCPU:      stableAvgCPU,
		CPUDeviation:      cpuDeviation,
		CanaryAvgMemory:   canaryAvgMemory,
		StableAvgMemory:   stableAvgMemory,
		MemoryDeviation:   memoryDeviation,
		CanaryAvgPlayers:  int32(canaryAvgPlayers),
		StableAvgPlayers:  int32(stableAvgPlayers),
		PlayerLossPercent: playerLossPercent,
		ComparisonTime:    &now,
		OverallHealthScore: healthScore,
	}, nil
}

func (m *Manager) promoteCanaryToFull(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	log.Info("Promoting canary to full upgrade")

	now := metav1.Now()
	gs.Status.Phase = gamev1alpha1.GameServerPhaseUpgrading
	gs.Status.CanaryStatus.Phase = "Promoting"
	gs.Status.LastUpdateTime = &now

	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "CanaryPromoted",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "CanaryPromoted",
		Message:            fmt.Sprintf("Canary promoted to full upgrade: %s", gs.Status.CanaryStatus.DecisionReason),
	})

	m.recorder.Event(gs, "Normal", "CanaryPromoted", "Canary upgrade promoted to full upgrade")

	if err := m.UpdateKruiseWorkload(ctx, gs); err != nil {
		log.Error(err, "Failed to update Kruise workload for full upgrade")
		return err
	}

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) rollbackCanary(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	log.Info("Rolling back canary upgrade", "reason", gs.Status.CanaryStatus.DecisionReason)

	now := metav1.Now()
	gs.Status.Phase = gamev1alpha1.GameServerPhaseRollingBack
	gs.Status.CanaryStatus.Phase = "RollingBack"
	gs.Status.LastUpdateTime = &now

	gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
		Type:               "CanaryRollback",
		Status:             "True",
		LastTransitionTime: now,
		Reason:             "CanaryRollback",
		Message:            fmt.Sprintf("Canary rollback initiated: %s", gs.Status.CanaryStatus.DecisionReason),
	})

	m.recorder.Event(gs, "Warning", "CanaryRollback", fmt.Sprintf("Rolling back: %s", gs.Status.CanaryStatus.DecisionReason))

	previousVersion := gs.Status.CurrentVersion
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return fmt.Errorf("failed to get pods for rollback: %w", err)
	}

	canaryReplicas := gs.Status.CanaryStatus.CanaryReplicas
	for i := int32(0); i < canaryReplicas && i < int32(len(pods)); i++ {
		pod := &pods[i]
		if pod.Spec.Containers[0].Image != previousVersion {
			pod.Spec.Containers[0].Image = previousVersion
			if err := m.client.Update(ctx, pod); err != nil {
				log.Error(err, "Failed to rollback pod", "pod", pod.Name)
			}
		}
	}

	gs.Status.Phase = gamev1alpha1.GameServerPhaseRunning
	gs.Status.TargetVersion = gs.Status.CurrentVersion
	gs.Status.CanaryStatus.Phase = "Completed"
	gs.Status.UpgradeProgress = nil
	gs.Status.LastUpdateTime = &metav1.Time{Time: time.Now()}

	m.recorder.Event(gs, "Normal", "RollbackCompleted", "Canary rollback completed")
	log.Info("Canary rollback completed")

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) processRollback(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	previousVersion := gs.Status.CurrentVersion

	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return fmt.Errorf("failed to get pods for rollback: %w", err)
	}

	allRolledBack := true
	for i := range pods {
		pod := &pods[i]
		if pod.Spec.Containers[0].Image != previousVersion {
			allRolledBack = false
			break
		}
	}

	if allRolledBack {
		now := metav1.Now()
		gs.Status.Phase = gamev1alpha1.GameServerPhaseRunning
		gs.Status.TargetVersion = gs.Status.CurrentVersion
		gs.Status.CanaryStatus = nil
		gs.Status.UpgradeProgress = nil
		gs.Status.MigrationStatus = nil
		gs.Status.LastUpdateTime = &now

		gs.Status.Conditions = append(gs.Status.Conditions, gamev1alpha1.GameServerCondition{
			Type:               "RollbackCompleted",
			Status:             "True",
			LastTransitionTime: now,
			Reason:             "RollbackCompleted",
			Message:            "Rollback completed successfully",
		})

		m.recorder.Event(gs, "Normal", "RollbackCompleted", "Rollback completed successfully")
		log.Info("Rollback completed")
	}

	return m.client.Status().Update(ctx, gs)
}

func (m *Manager) upgradeSinglePod(ctx context.Context, gs *gamev1alpha1.GameServer, podName string) error {
	pods, err := m.getGameServerPods(ctx, gs)
	if err != nil {
		return err
	}

	for i := range pods {
		if pods[i].Name == podName {
			pods[i].Spec.Containers[0].Image = gs.Spec.Template.Containers[0].Image
			if err := m.client.Update(ctx, &pods[i]); err != nil {
				return fmt.Errorf("failed to update pod %s: %w", podName, err)
			}
			return nil
		}
	}

	return fmt.Errorf("pod %s not found", podName)
}

func extractCPUPercents(metrics []agent.ResourceMetrics) []float64 {
	result := make([]float64, len(metrics))
	for i, m := range metrics {
		result[i] = m.CPUPercent
	}
	return result
}

func extractMemoryPercents(metrics []agent.ResourceMetrics) []float64 {
	result := make([]float64, len(metrics))
	for i, m := range metrics {
		result[i] = m.MemoryPercent
	}
	return result
}

func extractPlayerCounts(metrics []agent.ResourceMetrics) []int32 {
	result := make([]int32, len(metrics))
	for i, m := range metrics {
		result[i] = m.OnlinePlayers
	}
	return result
}

func avgFloat(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := float64(0)
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func avgInt(values []int32) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := int64(0)
	for _, v := range values {
		sum += int64(v)
	}
	return float64(sum) / float64(len(values))
}
