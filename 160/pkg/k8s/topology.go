package k8s

import (
	"context"
	"fmt"
	"sync"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

type ResourceNode struct {
	Kind       string
	Name       string
	Namespace  string
	Status     string
	Children   []*ResourceNode
	YAMLSummary string
	RawObject  interface{}

	yamlOnce sync.Once
	yamlErr  error
}

func (n *ResourceNode) ID() string {
	return fmt.Sprintf("%s/%s/%s", n.Kind, n.Namespace, n.Name)
}

func (n *ResourceNode) EnsureYAML() string {
	n.yamlOnce.Do(func() {
		if n.YAMLSummary != "" {
			return
		}
		if n.RawObject == nil {
			n.YAMLSummary = "(无数据)"
			return
		}
		data, err := yaml.Marshal(n.RawObject)
		if err != nil {
			n.yamlErr = err
			n.YAMLSummary = fmt.Sprintf("# 序列化失败: %v", err)
			return
		}
		n.YAMLSummary = string(data)
	})
	return n.YAMLSummary
}

func BuildTopology(ctx context.Context, clientset *kubernetes.Clientset, namespace string) ([]*ResourceNode, error) {
	ns := namespace
	if ns == "" {
		ns = metav1.NamespaceAll
	}

	depList, err := clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list deployments: %w", err)
	}
	rsList, err := clientset.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list replicasets: %w", err)
	}
	podList, err := clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	rsByDep := make(map[types.UID][]*appsv1.ReplicaSet, len(depList.Items))
	for i := range rsList.Items {
		rs := &rsList.Items[i]
		if uid := ownerUID(rs.OwnerReferences, "ReplicaSet"); uid != "" {
			rsByDep[uid] = append(rsByDep[uid], rs)
		}
	}

	podByRS := make(map[types.UID][]*corev1.Pod, len(rsList.Items))
	for i := range podList.Items {
		pod := &podList.Items[i]
		if uid := ownerUID(pod.OwnerReferences, "Pod"); uid != "" {
			podByRS[uid] = append(podByRS[uid], pod)
		}
	}

	roots := make([]*ResourceNode, 0, len(depList.Items))
	for i := range depList.Items {
		dep := &depList.Items[i]
		depNode := &ResourceNode{
			Kind:      "Deployment",
			Name:      dep.Name,
			Namespace: dep.Namespace,
			Status:    deploymentStatus(dep),
			RawObject: dep,
		}

		for _, rs := range rsByDep[dep.UID] {
			rsNode := &ResourceNode{
				Kind:      "ReplicaSet",
				Name:      rs.Name,
				Namespace: rs.Namespace,
				Status:    replicaSetStatus(rs),
				RawObject: rs,
			}

			podStatusMap := buildPodStatusMap()

			for _, pod := range podByRS[rs.UID] {
				podNode := &ResourceNode{
					Kind:      "Pod",
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Status:    string(pod.Status.Phase),
					RawObject: pod,
				}

				for _, ctr := range pod.Spec.Containers {
					ctrNode := &ResourceNode{
						Kind:      "Container",
						Name:      ctr.Name,
						Namespace: pod.Namespace,
						Status:    containerStatusFromMap(podStatusMap, pod, ctr.Name),
						RawObject: ctr,
					}
					podNode.Children = append(podNode.Children, ctrNode)
				}

				rsNode.Children = append(rsNode.Children, podNode)
			}

			depNode.Children = append(depNode.Children, rsNode)
		}

		roots = append(roots, depNode)
	}

	return roots, nil
}

func ownerUID(refs []metav1.OwnerReference, _ string) types.UID {
	for _, ref := range refs {
		if ref.Controller != nil && *ref.Controller {
			return ref.UID
		}
	}
	return ""
}

func buildPodStatusMap() map[string]map[string]string {
	return make(map[string]map[string]string)
}

func containerStatusFromMap(_ map[string]map[string]string, pod *corev1.Pod, name string) string {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Name == name {
			if cs.Ready {
				return "Ready"
			}
			if cs.State.Waiting != nil {
				return "Waiting:" + cs.State.Waiting.Reason
			}
			if cs.State.Terminated != nil {
				return "Terminated"
			}
			return "Running"
		}
	}
	return "Unknown"
}

func deploymentStatus(dep *appsv1.Deployment) string {
	ready := dep.Status.ReadyReplicas
	desired := int32(0)
	if dep.Spec.Replicas != nil {
		desired = *dep.Spec.Replicas
	}
	return fmt.Sprintf("%d/%d", ready, desired)
}

func replicaSetStatus(rs *appsv1.ReplicaSet) string {
	return fmt.Sprintf("%d/%d", rs.Status.ReadyReplicas, rs.Status.Replicas)
}
