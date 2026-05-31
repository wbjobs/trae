package main

import (
	"context"
	"flag"
	"os"
	"sync"

	v1 "github.com/database-backup-operator/api/v1"
	"github.com/database-backup-operator/controllers"
	"github.com/database-backup-operator/pkg/api"
	"github.com/database-backup-operator/pkg/backup"
	"github.com/database-backup-operator/pkg/precheck"
	s3client "github.com/database-backup-operator/pkg/s3client"
	"github.com/robfig/cron/v3"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

var (
	scheme   = runtime.NewScheme()
	setupLog = ctrl.Log.WithName("setup")
)

func init() {
	_ = clientgoscheme.AddToScheme(scheme)
	_ = v1.AddToScheme(scheme)
}

func main() {
	var metricsAddr string
	var probeAddr string
	var apiAddr string
	var backupDir string
	var enableLeaderElection bool

	flag.StringVar(&metricsAddr, "metrics-bind-address", ":8080", "The address the metric endpoint binds to.")
	flag.StringVar(&probeAddr, "health-probe-bind-address", ":8081", "The address the probe endpoint binds to.")
	flag.StringVar(&apiAddr, "api-bind-address", ":8082", "The address the API server binds to.")
	flag.StringVar(&backupDir, "backup-dir", "/tmp/backups", "Directory for local backup files.")
	flag.BoolVar(&enableLeaderElection, "leader-elect", false, "Enable leader election for controller manager.")
	opts := zap.Options{Development: true}
	opts.BindFlags(flag.CommandLine)
	flag.Parse()

	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme:                 scheme,
		HealthProbeBindAddress: probeAddr,
		LeaderElection:         enableLeaderElection,
		LeaderElectionID:       "database-backup-operator",
	})
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	cronInstance := cron.New()
	cronInstance.Start()

	backupSvc := backup.NewService(backupDir)
	preCheckSvc := precheck.NewService(backupDir)

	reconciler := &controllers.DatabaseBackupReconciler{
		Client:       mgr.GetClient(),
		Scheme:       mgr.GetScheme(),
		Log:          ctrl.Log.WithName("controllers").WithName("DatabaseBackup"),
		BackupSvc:    backupSvc,
		PreCheckSvc:  preCheckSvc,
		S3Clients:    make(map[string]*s3client.Client),
		S3ClientsMux: sync.RWMutex{},
		Cron:         cronInstance,
		CronEntries:  make(map[types.NamespacedName]cron.EntryID),
		CronMux:      sync.RWMutex{},
	}

	if err = reconciler.SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "DatabaseBackup")
		os.Exit(1)
	}

	apiServer := api.NewServer(mgr.GetClient())
	go func() {
		setupLog.Info("starting API server", "addr", apiAddr)
		if err := apiServer.Run(apiAddr); err != nil {
			setupLog.Error(err, "API server failed")
		}
	}()

	ctx := context.Background()
	go reconciler.StartBackupWorker(ctx)

	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up health check")
		os.Exit(1)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up ready check")
		os.Exit(1)
	}

	setupLog.Info("starting manager")
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}
