package tui

import (
	"reflect"
	"sort"
	"strings"

	"docker-compose-tui/parser"
)

type serviceChange struct {
	Service string
	Field   string
	Old     string
	New     string
}

type configDiff struct {
	Added    []string
	Removed  []string
	Modified []serviceChange
}

func (d *configDiff) hasChanges() bool {
	return len(d.Added) > 0 || len(d.Removed) > 0 || len(d.Modified) > 0
}

func computeDiff(oldCfg, newCfg *parser.ComposeConfig) *configDiff {
	diff := &configDiff{}

	oldSet := make(map[string]bool)
	for name := range oldCfg.Services {
		oldSet[name] = true
	}

	newSet := make(map[string]bool)
	for name := range newCfg.Services {
		newSet[name] = true
	}

	for name := range oldCfg.Services {
		if !newSet[name] {
			diff.Removed = append(diff.Removed, name)
		}
	}

	for name, newSvc := range newCfg.Services {
		if !oldSet[name] {
			diff.Added = append(diff.Added, name)
			continue
		}
		oldSvc := oldCfg.Services[name]
		diff.Modified = append(diff.Modified, diffServiceFields(name, oldSvc, newSvc)...)
	}

	return diff
}

func diffServiceFields(name string, oldSvc, newSvc parser.ServiceInfo) []serviceChange {
	var changes []serviceChange

	if oldSvc.Image != newSvc.Image {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "image",
			Old:     oldSvc.Image,
			New:     newSvc.Image,
		})
	}

	oldPorts := formatPorts(oldSvc.Ports)
	newPorts := formatPorts(newSvc.Ports)
	if oldPorts != newPorts {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "ports",
			Old:     oldPorts,
			New:     newPorts,
		})
	}

	oldDeps := joinSorted(oldSvc.DependsOn)
	newDeps := joinSorted(newSvc.DependsOn)
	if oldDeps != newDeps {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "depends_on",
			Old:     oldDeps,
			New:     newDeps,
		})
	}

	oldVols := joinSorted(oldSvc.Volumes)
	newVols := joinSorted(newSvc.Volumes)
	if oldVols != newVols {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "volumes",
			Old:     oldVols,
			New:     newVols,
		})
	}

	oldNets := joinSorted(oldSvc.Networks)
	newNets := joinSorted(newSvc.Networks)
	if oldNets != newNets {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "networks",
			Old:     oldNets,
			New:     newNets,
		})
	}

	if oldSvc.Restart != newSvc.Restart {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "restart",
			Old:     oldSvc.Restart,
			New:     newSvc.Restart,
		})
	}

	if oldSvc.WorkingDir != newSvc.WorkingDir {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "working_dir",
			Old:     oldSvc.WorkingDir,
			New:     newSvc.WorkingDir,
		})
	}

	if !reflect.DeepEqual(oldSvc.Command, newSvc.Command) {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "command",
			Old:     joinSorted(oldSvc.Command),
			New:     joinSorted(newSvc.Command),
		})
	}

	if !reflect.DeepEqual(oldSvc.EnvVars, newSvc.EnvVars) {
		changes = append(changes, serviceChange{
			Service: name,
			Field:   "environment",
			Old:     formatMap(oldSvc.EnvVars),
			New:     formatMap(newSvc.EnvVars),
		})
	}

	return changes
}

func formatPorts(ports []parser.PortMapping) string {
	var parts []string
	for _, p := range ports {
		s := p.Host
		if p.Protocol != "" {
			s += "/" + p.Protocol
		}
		s += "->" + p.Container
		parts = append(parts, s)
	}
	return joinSorted(parts)
}

func formatMap(m map[string]string) string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		parts = append(parts, k+"="+m[k])
	}
	return strings.Join(parts, ",")
}
