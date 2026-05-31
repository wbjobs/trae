package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	gamev1alpha1 "gameserver-operator/api/v1alpha1"
	"gameserver-operator/pkg/metrics"
	"gameserver-operator/pkg/upgrade"

	corev1 "k8s.io/api/core/v1"
	kruiseappsv1alpha1 "github.com/openkruise/kruise-api/apps/v1alpha1"
)

const (
	gameServerFinalizer    = "game.kruise.io/finalizer"
	preStopHookFinalizer   = "game.kruise.io/pre-stop"
	requeueAfter           = 30 * time.Second
	defaultGracePeriod     = int64(60)
)

type GameServerReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	Log      logr.Logger
}

func (r *GameServerReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("gameserver", req.NamespacedName)

	var gs gamev1alpha1.GameServer
	if err := r.Get(ctx, req.NamespacedName, &gs); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if !gs.ObjectMeta.DeletionTimestamp.IsZero() {
		return r.reconcileDelete(ctx, &gs, log)
	}

	if !controllerutil.ContainsFinalizer(&gs, gameServerFinalizer) {
		controllerutil.AddFinalizer(&gs, gameServerFinalizer)
		if err := r.Update(ctx, &gs); err != nil {
			return ctrl.Result{}, err
		}
	}

	if err := r.reconcileCloneSet(ctx, &gs, log); err != nil {
		return ctrl.Result{}, err
	}

	upgradeManager := upgrade.NewManager(r.Client, r.Recorder, log)
	if err := upgradeManager.ReconcileUpgrade(ctx, &gs); err != nil {
		log.Error(err, "Failed to reconcile upgrade")
		return ctrl.Result{RequeueAfter: requeueAfter}, nil
	}

	r.updateMetrics(&gs)

	return ctrl.Result{RequeueAfter: requeueAfter}, nil
}

func (r *GameServerReconciler) reconcileCloneSet(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) error {
	cloneSetLabels := map[string]string{
		"game.kruise.io/gameserver": gs.Name,
		"game.kruise.io/game":       gs.Spec.GameName,
		"app":                       "gameserver",
	}

	cloneSetSelector := metav1.LabelSelector{
		MatchLabels: cloneSetLabels,
	}

	gamePorts := []corev1.ContainerPort{
		{
			Name:          "game",
			ContainerPort: 9000,
			Protocol:      corev1.ProtocolTCP,
		},
	}

	agentPort := getAgentPort(gs)
	gracePeriod := defaultGracePeriod
	if gs.Spec.UpgradePolicy.MigrationTimeoutSeconds > 0 {
		gracePeriod = int64(gs.Spec.UpgradePolicy.MigrationTimeoutSeconds)
	}

	desiredCloneSet := &kruiseappsv1alpha1.CloneSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gs.Name + "-cloneset",
			Namespace: gs.Namespace,
			Labels:    cloneSetLabels,
		},
		Spec: kruiseappsv1alpha1.CloneSetSpec{
			Replicas: &gs.Spec.Replicas,
			Selector: &cloneSetSelector,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: cloneSetLabels,
				},
				Spec: corev1.PodSpec{
					TerminationGracePeriodSeconds: &gracePeriod,
					Containers: []corev1.Container{
						{
							Name:  "gameserver",
							Image: gs.Spec.Template.Containers[0].Image,
							Ports: gamePorts,
							Lifecycle: &corev1.Lifecycle{
								PreStop: &corev1.LifecycleHandler{
									Exec: &corev1.ExecAction{
										Command: []string{
											"/bin/sh",
											"-c",
											"echo 'pre-stop hook: waiting for agent to drain and shutdown...'",
										},
									},
								},
							},
						},
						{
							Name:  "agent",
							Image: "gameserver-agent:latest",
							Ports: []corev1.ContainerPort{
								{
									Name:          "agent",
									ContainerPort: agentPort,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name: "POD_NAME",
									ValueFrom: &corev1.EnvVarSource{
										FieldRef: &corev1.ObjectFieldSelector{
											FieldPath: "metadata.name",
										},
									},
								},
								{
									Name: "POD_NAMESPACE",
									ValueFrom: &corev1.EnvVarSource{
										FieldRef: &corev1.ObjectFieldSelector{
											FieldPath: "metadata.namespace",
										},
									},
								},
								{
									Name:  "GAME_PORTS",
									Value: "9000",
								},
							},
							Lifecycle: &corev1.Lifecycle{
								PostStart: &corev1.LifecycleHandler{
									Exec: &corev1.ExecAction{
										Command: []string{
											"/bin/sh",
											"-c",
											fmt.Sprintf("curl -s -X PUT http://localhost:%d/ports/config -H 'Content-Type: application/json' -d '{\"ports\":[9000]}' || true", agentPort),
										},
									},
								},
								PreStop: &corev1.LifecycleHandler{
									Exec: &corev1.ExecAction{
										Command: []string{
											"/bin/sh",
											"-c",
											fmt.Sprintf(`
echo "Agent pre-stop: draining and shutting down game server"
curl -s -X POST http://localhost:%d/drain -H 'Content-Type: application/json' -d '{"timeoutSeconds":60}' || true
curl -s -X POST http://localhost:%d/shutdown/signal || true
for i in $(seq 1 30); do
  STATUS=$(curl -s http://localhost:%d/shutdown/status 2>/dev/null | grep -o '"processExited":true')
  PORTS=$(curl -s http://localhost:%d/ports/check 2>/dev/null | grep -o '"allReleased":true')
  if [ -n "$STATUS" ] && [ -n "$PORTS" ]; then
    echo "Game server process exited and all ports released"
    break
  fi
  sleep 1
done
echo "Agent pre-stop completed"
`, agentPort, agentPort, agentPort, agentPort),
										},
									},
								},
							},
						},
					},
				},
			},
			UpdateStrategy: kruiseappsv1alpha1.UpdateStrategy{
				Type:           kruiseappsv1alpha1.InPlaceOnlyPodUpdateStrategyType,
				MaxUnavailable: getMaxUnavailable(gs),
				InPlaceUpdateStrategy: &kruiseappsv1alpha1.InPlaceUpdateStrategy{
					GracePeriodSeconds: int32(gracePeriod),
				},
			},
			Lifecycle: &kruiseappsv1alpha1.Lifecycle{
				PreDelete: &kruiseappsv1alpha1.LifecycleHandler{
					FinalizersHandler: []string{preStopHookFinalizer},
				},
				InPlaceUpdate: &kruiseappsv1alpha1.LifecycleHandler{
					FinalizersHandler: []string{preStopHookFinalizer},
				},
			},
			ScaleStrategy: kruiseappsv1alpha1.ScaleStrategy{
				MaxUnavailable: getMaxUnavailable(gs),
			},
		},
	}

	if gs.Spec.UpgradePolicy.Canary != nil && gs.Spec.UpgradePolicy.Canary.Enable {
		desiredCloneSet.Spec.UpdateStrategy.Paused = isCanaryPaused(gs)
	}

	if err := ctrl.SetControllerReference(gs, desiredCloneSet, r.Scheme); err != nil {
		return fmt.Errorf("failed to set controller reference: %w", err)
	}

	var existingCloneSet kruiseappsv1alpha1.CloneSet
	err := r.Get(ctx, client.ObjectKeyFromObject(desiredCloneSet), &existingCloneSet)
	if err != nil {
		if client.IgnoreNotFound(err) != nil {
			return err
		}

		log.Info("Creating CloneSet", "name", desiredCloneSet.Name)
		return r.Create(ctx, desiredCloneSet)
	}

	needsUpdate := false
	if len(existingCloneSet.Spec.Template.Spec.Containers) > 0 {
		if existingCloneSet.Spec.Template.Spec.Containers[0].Image != gs.Spec.Template.Containers[0].Image {
			needsUpdate = true
		}
	}

	if gs.Status.Phase == gamev1alpha1.GameServerPhaseCanary && gs.Status.CanaryStatus != nil {
		switch gs.Status.CanaryStatus.Phase {
		case "Observing", "Deciding":
			if existingCloneSet.Spec.UpdateStrategy.Paused == nil || !*existingCloneSet.Spec.UpdateStrategy.Paused {
				needsUpdate = true
				desiredCloneSet.Spec.UpdateStrategy.Paused = boolPtr(true)
			}
		}
	}

	if gs.Status.Phase == gamev1alpha1.GameServerPhaseRollingBack {
		desiredCloneSet.Spec.Template.Spec.Containers[0].Image = gs.Status.CurrentVersion
		needsUpdate = true
	}

	if needsUpdate {
		log.Info("Updating CloneSet", "name", existingCloneSet.Name, "phase", gs.Status.Phase)
		if desiredCloneSet.Spec.UpdateStrategy.Paused != nil {
			existingCloneSet.Spec.UpdateStrategy.Paused = desiredCloneSet.Spec.UpdateStrategy.Paused
		}
		if gs.Status.Phase == gamev1alpha1.GameServerPhaseRollingBack {
			existingCloneSet.Spec.Template.Spec.Containers[0].Image = gs.Status.CurrentVersion
		} else {
			existingCloneSet.Spec.Template.Spec.Containers[0].Image = gs.Spec.Template.Containers[0].Image
		}
		return r.Update(ctx, &existingCloneSet)
	}

	return nil
}

func isCanaryPaused(gs *gamev1alpha1.GameServer) *bool {
	if gs.Status.CanaryStatus == nil {
		return boolPtr(false)
	}

	switch gs.Status.CanaryStatus.Phase {
	case "Observing", "Deciding":
		return boolPtr(true)
	default:
		return boolPtr(false)
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func (r *GameServerReconciler) reconcileDelete(ctx context.Context, gs *gamev1alpha1.GameServer, log logr.Logger) (ctrl.Result, error) {
	if controllerutil.ContainsFinalizer(gs, gameServerFinalizer) {
		log.Info("Cleaning up GameServer resources")

		r.Recorder.Event(gs, "Normal", "Deleting", "Cleaning up GameServer resources")

		controllerutil.RemoveFinalizer(gs, gameServerFinalizer)
		if err := r.Update(ctx, gs); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

func (r *GameServerReconciler) updateMetrics(gs *gamev1alpha1.GameServer) {
	progress := float64(0)
	if gs.Status.UpgradeProgress != nil {
		progress = float64(gs.Status.UpgradeProgress.Percentage)
	}

	migrated := int32(0)
	failed := int32(0)
	total := int32(0)

	if gs.Status.MigrationStatus != nil {
		migrated = gs.Status.MigrationStatus.MigratedPlayers
		failed = gs.Status.MigrationStatus.FailedPlayers
		total = gs.Status.MigrationStatus.TotalPlayers
	}

	metrics.UpdateGameServerMetrics(
		gs.Namespace,
		gs.Name,
		string(gs.Status.Phase),
		progress,
		gs.Status.OnlinePlayers,
		migrated,
		failed,
		total,
	)

	metrics.UpdateGameServerReplicaMetrics(
		gs.Namespace,
		gs.Name,
		gs.Status.ReadyReplicas,
		gs.Status.UpdatedReplicas,
		gs.Status.TotalReplicas,
	)
}

func (r *GameServerReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gamev1alpha1.GameServer{}).
		Owns(&kruiseappsv1alpha1.CloneSet{}).
		Complete(r)
}

func getAgentPort(gs *gamev1alpha1.GameServer) int32 {
	if gs.Spec.UpgradePolicy.AgentPort != 0 {
		return gs.Spec.UpgradePolicy.AgentPort
	}
	return 8080
}

func getMaxUnavailable(gs *gamev1alpha1.GameServer) *intstr.IntOrString {
	if gs.Spec.UpgradePolicy.MaxUnavailable != nil {
		return gs.Spec.UpgradePolicy.MaxUnavailable
	}
	return &intstr.IntOrString{Type: intstr.Int, IntVal: 1}
}
