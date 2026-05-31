package monitor

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/mqtt-shared-sub/lb/internal/balancer"
)

type Monitor struct {
	lb                   *balancer.LoadBalancer
	server               *http.Server
	addr                 string
	registry             *prometheus.Registry
	totalMessages        prometheus.Gauge
	dispatchedMessages   prometheus.Gauge
	failedMessages       prometheus.Gauge
	retriedMessages      prometheus.Gauge
	deadLetterMessages   prometheus.Gauge
	dedupHits            prometheus.Gauge
	dedupMisses          prometheus.Gauge
	dedupCacheSize       prometheus.Gauge
	subscriberLatency    *prometheus.GaugeVec
	subscriberCount      *prometheus.GaugeVec
	subscriberFailCount  *prometheus.GaugeVec
	groupMessageCount    *prometheus.GaugeVec
	groupDeadLetterCount *prometheus.GaugeVec
	dispatchLatency      prometheus.Histogram
}

func NewMonitor(lb *balancer.LoadBalancer, addr string) *Monitor {
	reg := prometheus.NewRegistry()

	m := &Monitor{
		lb:       lb,
		addr:     addr,
		registry: reg,
		totalMessages: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_total_messages",
			Help: "Total number of messages received",
		}),
		dispatchedMessages: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_dispatched_messages",
			Help: "Total number of messages successfully dispatched",
		}),
		failedMessages: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_failed_messages",
			Help: "Total number of messages that failed to dispatch",
		}),
		retriedMessages: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_retried_messages",
			Help: "Total number of messages that were retried",
		}),
		deadLetterMessages: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_dead_letter_messages",
			Help: "Total number of messages in dead letter queue",
		}),
		dedupHits: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_dedup_hits",
			Help: "Total number of deduplication cache hits",
		}),
		dedupMisses: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_dedup_misses",
			Help: "Total number of deduplication cache misses",
		}),
		dedupCacheSize: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mqtt_lb_dedup_cache_size",
			Help: "Current size of deduplication cache",
		}),
		subscriberLatency: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "mqtt_lb_subscriber_latency_ms",
				Help: "Latency per subscriber in milliseconds",
			},
			[]string{"group", "client_id"},
		),
		subscriberCount: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "mqtt_lb_subscriber_count",
				Help: "Number of subscribers per group",
			},
			[]string{"group"},
		),
		subscriberFailCount: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "mqtt_lb_subscriber_fail_count",
				Help: "Number of failures per subscriber",
			},
			[]string{"group", "client_id"},
		),
		groupMessageCount: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "mqtt_lb_group_message_count",
				Help: "Number of messages per group",
			},
			[]string{"group"},
		),
		groupDeadLetterCount: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "mqtt_lb_group_dead_letter_count",
				Help: "Number of dead letter messages per group",
			},
			[]string{"group"},
		),
		dispatchLatency: prometheus.NewHistogram(
			prometheus.HistogramOpts{
				Name:    "mqtt_lb_dispatch_latency_ms",
				Help:    "Message dispatch latency distribution",
				Buckets: prometheus.DefBuckets,
			},
		),
	}

	reg.MustRegister(
		m.totalMessages,
		m.dispatchedMessages,
		m.failedMessages,
		m.retriedMessages,
		m.deadLetterMessages,
		m.dedupHits,
		m.dedupMisses,
		m.dedupCacheSize,
		m.subscriberLatency,
		m.subscriberCount,
		m.subscriberFailCount,
		m.groupMessageCount,
		m.groupDeadLetterCount,
		m.dispatchLatency,
	)

	return m
}

func (m *Monitor) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{}))

	m.server = &http.Server{
		Addr:    m.addr,
		Handler: mux,
	}

	go m.collectMetrics(ctx)

	log.Printf("[Monitor] Prometheus metrics endpoint on %s/metrics", m.addr)
	return m.server.ListenAndServe()
}

func (m *Monitor) Shutdown() error {
	if m.server != nil {
		return m.server.Close()
	}
	return nil
}

func (m *Monitor) collectMetrics(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.updateMetrics()
		}
	}
}

func (m *Monitor) updateMetrics() {
	metrics := m.lb.GetMetrics()

	metrics.MutexRLock()
	m.totalMessages.Set(float64(metrics.TotalMessages))
	m.dispatchedMessages.Set(float64(metrics.Dispatched))
	m.failedMessages.Set(float64(metrics.Failed))
	m.retriedMessages.Set(float64(metrics.Retried))
	m.deadLetterMessages.Set(float64(metrics.DeadLetterCount))
	m.dedupHits.Set(float64(metrics.DedupHits))
	m.dedupMisses.Set(float64(metrics.DedupMisses))
	m.dispatchLatency.Observe(float64(metrics.AvgDispatchTime.Milliseconds()))
	metrics.MutexRUnlock()

	_, _, _, cacheSize := m.lb.GetDedupStats()
	m.dedupCacheSize.Set(float64(cacheSize))

	groups := m.lb.GetAllGroups()
	for _, group := range groups {
		subs := group.GetSubscribers()
		m.subscriberCount.WithLabelValues(group.Name).Set(float64(len(subs)))

		totalMsgs := int64(0)
		for _, sub := range subs {
			m.subscriberLatency.WithLabelValues(group.Name, sub.ClientID).Set(float64(sub.AvgLatency.Milliseconds()))
			m.subscriberFailCount.WithLabelValues(group.Name, sub.ClientID).Set(float64(sub.GetFailCount()))
			totalMsgs += sub.MsgCount
		}
		m.groupMessageCount.WithLabelValues(group.Name).Set(float64(totalMsgs))

		dlq := group.GetDeadLetterMessages()
		m.groupDeadLetterCount.WithLabelValues(group.Name).Set(float64(len(dlq)))
	}
}
