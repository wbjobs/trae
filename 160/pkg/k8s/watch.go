package k8s

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

type WatchEventType string

const (
	EventAdded    WatchEventType = "ADDED"
	EventModified WatchEventType = "MODIFIED"
	EventDeleted  WatchEventType = "DELETED"
)

type WatchEvent struct {
	Type      WatchEventType
	Kind      string
	Name      string
	Namespace string
	Object    interface{}
}

type Watcher struct {
	clientset *kubernetes.Clientset
	namespace string

	factory informers.SharedInformerFactory
	events  chan []WatchEvent

	stopCh chan struct{}
	done   chan struct{}

	pendingMu chan struct{}
	pending   []WatchEvent
}

func NewWatcher(clientset *kubernetes.Clientset, namespace string) *Watcher {
	return &Watcher{
		clientset: clientset,
		namespace: namespace,
		events:    make(chan []WatchEvent, 16),
		stopCh:    make(chan struct{}),
		done:      make(chan struct{}),
		pendingMu: make(chan struct{}, 1),
	}
}

func (w *Watcher) Start(ctx context.Context) error {
	ns := w.namespace
	if ns == "" {
		ns = metav1.NamespaceAll
	}

	w.factory = informers.NewSharedInformerFactoryWithOptions(
		w.clientset,
		30*time.Second,
		informers.WithNamespace(ns),
	)

	depInformer := w.factory.Apps().V1().Deployments().Informer()
	rsInformer := w.factory.Apps().V1().ReplicaSets().Informer()
	podInformer := w.factory.Core().V1().Pods().Informer()

	depInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { w.enqueue(EventAdded, "Deployment", obj) },
		UpdateFunc: func(_, newObj interface{}) { w.enqueue(EventModified, "Deployment", newObj) },
		DeleteFunc: func(obj interface{}) { w.enqueue(EventDeleted, "Deployment", obj) },
	})

	rsInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { w.enqueue(EventAdded, "ReplicaSet", obj) },
		UpdateFunc: func(_, newObj interface{}) { w.enqueue(EventModified, "ReplicaSet", newObj) },
		DeleteFunc: func(obj interface{}) { w.enqueue(EventDeleted, "ReplicaSet", obj) },
	})

	podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { w.enqueue(EventAdded, "Pod", obj) },
		UpdateFunc: func(_, newObj interface{}) { w.enqueue(EventModified, "Pod", newObj) },
		DeleteFunc: func(obj interface{}) { w.enqueue(EventDeleted, "Pod", obj) },
	})

	w.factory.Start(w.stopCh)

	for _, ok := range w.factory.WaitForCacheSync(w.stopCh) {
		if !ok {
			return fmt.Errorf("informer cache sync failed")
		}
	}

	go w.flushLoop(ctx)

	return nil
}

func (w *Watcher) enqueue(eventType WatchEventType, kind string, obj interface{}) {
	evt := WatchEvent{Type: eventType, Kind: kind, Object: obj}
	switch o := obj.(type) {
	case *appsv1.Deployment:
		evt.Name = o.Name
		evt.Namespace = o.Namespace
	case *appsv1.ReplicaSet:
		evt.Name = o.Name
		evt.Namespace = o.Namespace
	case *corev1.Pod:
		evt.Name = o.Name
		evt.Namespace = o.Namespace
	case cache.DeletedFinalStateUnknown:
		evt.Name = "unknown"
	}

	select {
	case w.pendingMu <- struct{}{}:
		w.pending = append(w.pending, evt)
		<-w.pendingMu
	default:
	}
}

func (w *Watcher) flushLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.flush()
		}
	}
}

func (w *Watcher) flush() {
	select {
	case w.pendingMu <- struct{}{}:
		if len(w.pending) == 0 {
			<-w.pendingMu
			return
		}
		batch := make([]WatchEvent, len(w.pending))
		copy(batch, w.pending)
		w.pending = w.pending[:0]
		<-w.pendingMu

		select {
		case w.events <- batch:
		default:
		}
	default:
	}
}

func (w *Watcher) Events() <-chan []WatchEvent {
	return w.events
}

func (w *Watcher) Stop() {
	select {
	case <-w.stopCh:
	default:
		close(w.stopCh)
	}
}
