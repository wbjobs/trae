module ssh-bastion-audit

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.5.0
	github.com/jackc/pgx/v5 v5.5.0
	github.com/minio/minio-go/v7 v7.0.66
	go.etcd.io/etcd/client/v3 v3.5.10
	golang.org/x/crypto v0.17.0
	github.com/robfig/cron/v3 v3.0.1
	github.com/sirupsen/logrus v1.9.3
	github.com/spf13/viper v1.18.2
	gopkg.in/yaml.v3 v3.0.1
)
