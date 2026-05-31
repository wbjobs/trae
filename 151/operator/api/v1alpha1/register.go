package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	GroupVersion = schema.GroupVersion{Group: "game.kruise.io", Version: "v1alpha1"}

	SchemeBuilder = runtime.NewSchemeBuilder(addKnownTypes)
	AddToScheme   = SchemeBuilder.AddToScheme
)

func Resource(resource string) schema.GroupResource {
	return GroupVersion.WithResource(resource).GroupResource()
}

func addKnownTypes(scheme *runtime.Scheme) error {
	scheme.AddKnownTypes(GroupVersion,
		&GameServer{},
		&GameServerList{},
	)
	metav1.AddToGroupVersion(scheme, GroupVersion)
	return nil
}

func (in *GameServer) DeepCopyObject() runtime.Object {
	if in == nil {
		return nil
	}
	out := new(GameServer)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServer) DeepCopyInto(out *GameServer) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ObjectMeta.DeepCopyInto(&out.ObjectMeta)
	in.Spec.DeepCopyInto(&out.Spec)
	in.Status.DeepCopyInto(&out.Status)
}

func (in *GameServer) DeepCopy() *GameServer {
	if in == nil {
		return nil
	}
	out := new(GameServer)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerSpec) DeepCopyInto(out *GameServerSpec) {
	*out = *in
	out.Template = *in.Template.DeepCopy()
	if in.UpgradePolicy != nil {
		in.UpgradePolicy.DeepCopyInto(out.UpgradePolicy)
	}
}

func (in *GameServerSpec) DeepCopy() *GameServerSpec {
	if in == nil {
		return nil
	}
	out := new(GameServerSpec)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerTemplate) DeepCopyInto(out *GameServerTemplate) {
	*out = *in
	if in.Containers != nil {
		in, out := &in.Containers, &out.Containers
		*out = make([]GameServerContainer, len(*in))
		copy(*out, *in)
	}
}

func (in *GameServerTemplate) DeepCopy() *GameServerTemplate {
	if in == nil {
		return nil
	}
	out := new(GameServerTemplate)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerContainer) DeepCopyInto(out *GameServerContainer) {
	*out = *in
}

func (in *GameServerContainer) DeepCopy() *GameServerContainer {
	if in == nil {
		return nil
	}
	out := new(GameServerContainer)
	in.DeepCopyInto(out)
	return out
}

func (in *UpgradePolicy) DeepCopyInto(out *UpgradePolicy) {
	*out = *in
	if in.MaxUnavailable != nil {
		*out = *in
		deepCopyIntOrString(in.MaxUnavailable, out.MaxUnavailable)
	}
}

func (in *UpgradePolicy) DeepCopy() *UpgradePolicy {
	if in == nil {
		return nil
	}
	out := new(UpgradePolicy)
	in.DeepCopyInto(out)
	return out
}

func deepCopyIntOrString(in, out *intstr.IntOrString) {
	*out = *in
}

func (in *GameServerStatus) DeepCopyInto(out *GameServerStatus) {
	*out = *in
	if in.MigrationStatus != nil {
		in, out := &in.MigrationStatus, &out.MigrationStatus
		*out = new(MigrationStatus)
		(*in).DeepCopyInto(*out)
	}
	if in.UpgradeProgress != nil {
		in, out := &in.UpgradeProgress, &out.UpgradeProgress
		*out = new(UpgradeProgress)
		(*in).DeepCopyInto(*out)
	}
	if in.Conditions != nil {
		in, out := &in.Conditions, &out.Conditions
		*out = make([]GameServerCondition, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.LastUpdateTime != nil {
		in, out := &in.LastUpdateTime, &out.LastUpdateTime
		*out = (*in).DeepCopy()
	}
}

func (in *GameServerStatus) DeepCopy() *GameServerStatus {
	if in == nil {
		return nil
	}
	out := new(GameServerStatus)
	in.DeepCopyInto(out)
	return out
}

func (in *MigrationStatus) DeepCopyInto(out *MigrationStatus) {
	*out = *in
	if in.StartTime != nil {
		in, out := &in.StartTime, &out.StartTime
		*out = (*in).DeepCopy()
	}
	if in.EndTime != nil {
		in, out := &in.EndTime, &out.EndTime
		*out = (*in).DeepCopy()
	}
	if in.Players != nil {
		in, out := &in.Players, &out.Players
		*out = make([]PlayerMigration, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
}

func (in *MigrationStatus) DeepCopy() *MigrationStatus {
	if in == nil {
		return nil
	}
	out := new(MigrationStatus)
	in.DeepCopyInto(out)
	return out
}

func (in *PlayerMigration) DeepCopyInto(out *PlayerMigration) {
	*out = *in
	if in.MigrateTime != nil {
		in, out := &in.MigrateTime, &out.MigrateTime
		*out = (*in).DeepCopy()
	}
}

func (in *PlayerMigration) DeepCopy() *PlayerMigration {
	if in == nil {
		return nil
	}
	out := new(PlayerMigration)
	in.DeepCopyInto(out)
	return out
}

func (in *UpgradeProgress) DeepCopyInto(out *UpgradeProgress) {
	*out = *in
	if in.StartTime != nil {
		in, out := &in.StartTime, &out.StartTime
		*out = (*in).DeepCopy()
	}
}

func (in *UpgradeProgress) DeepCopy() *UpgradeProgress {
	if in == nil {
		return nil
	}
	out := new(UpgradeProgress)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerCondition) DeepCopyInto(out *GameServerCondition) {
	*out = *in
	in.LastTransitionTime.DeepCopyInto(&out.LastTransitionTime)
}

func (in *GameServerCondition) DeepCopy() *GameServerCondition {
	if in == nil {
		return nil
	}
	out := new(GameServerCondition)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerList) DeepCopyObject() runtime.Object {
	if in == nil {
		return nil
	}
	out := new(GameServerList)
	in.DeepCopyInto(out)
	return out
}

func (in *GameServerList) DeepCopyInto(out *GameServerList) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ListMeta.DeepCopyInto(&out.ListMeta)
	if in.Items != nil {
		in, out := &in.Items, &out.Items
		*out = make([]GameServer, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
}

func (in *GameServerList) DeepCopy() *GameServerList {
	if in == nil {
		return nil
	}
	out := new(GameServerList)
	in.DeepCopyInto(out)
	return out
}
