package tui

import (
	"docker-compose-tui/parser"
	"sort"
)

type depGraph struct {
	forward  map[string][]string
	reverse  map[string][]string
	inDegree map[string]int
	services []string
}

func buildDepGraph(config *parser.ComposeConfig) *depGraph {
	g := &depGraph{
		forward:  make(map[string][]string),
		reverse:  make(map[string][]string),
		inDegree: make(map[string]int),
	}

	for name := range config.Services {
		g.services = append(g.services, name)
		if _, ok := g.forward[name]; !ok {
			g.forward[name] = nil
		}
		if _, ok := g.reverse[name]; !ok {
			g.reverse[name] = nil
		}
		g.inDegree[name] = 0
	}

	for name, svc := range config.Services {
		for _, dep := range svc.DependsOn {
			if _, exists := config.Services[dep]; !exists {
				continue
			}
			g.forward[dep] = append(g.forward[dep], name)
			g.reverse[name] = append(g.reverse[name], dep)
			g.inDegree[name]++
		}
	}

	for k := range g.forward {
		sort.Strings(g.forward[k])
	}
	for k := range g.reverse {
		sort.Strings(g.reverse[k])
	}
	sort.Strings(g.services)

	return g
}

func (g *depGraph) startOrder() []string {
	inDeg := make(map[string]int)
	for k, v := range g.inDegree {
		inDeg[k] = v
	}

	var result []string
	var queue []string

	for _, svc := range g.services {
		if inDeg[svc] == 0 {
			queue = append(queue, svc)
		}
	}
	sort.Strings(queue)

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		result = append(result, node)

		for _, next := range g.forward[node] {
			inDeg[next]--
			if inDeg[next] == 0 {
				queue = append(queue, next)
				sort.Strings(queue)
			}
		}
	}

	if len(result) != len(g.services) {
		return g.services
	}
	return result
}

func (g *depGraph) stopOrder() []string {
	start := g.startOrder()
	result := make([]string, len(start))
	for i, v := range start {
		result[len(start)-1-i] = v
	}
	return result
}

func (g *depGraph) stopOrderFor(target string) []string {
	visited := make(map[string]bool)
	var order []string

	var dfs func(svc string)
	dfs = func(svc string) {
		if visited[svc] {
			return
		}
		visited[svc] = true
		for _, dependent := range g.forward[svc] {
			dfs(dependent)
		}
		order = append(order, svc)
	}

	dfs(target)

	stop := make([]string, len(order))
	for i, v := range order {
		stop[len(order)-1-i] = v
	}
	return stop
}

func (g *depGraph) dependentsOf(svc string) []string {
	result := make([]string, len(g.forward[svc]))
	copy(result, g.forward[svc])
	return result
}

func (g *depGraph) dependenciesOf(svc string) []string {
	result := make([]string, len(g.reverse[svc]))
	copy(result, g.reverse[svc])
	return result
}
