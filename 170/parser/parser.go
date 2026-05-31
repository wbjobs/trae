package parser

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type PortMapping struct {
	Host      string
	Container string
	Protocol  string
}

type ServiceInfo struct {
	Name       string
	Image      string
	Command    []string
	EnvVars    map[string]string
	Ports      []PortMapping
	Volumes    []string
	DependsOn  []string
	Labels     map[string]string
	Restart    string
	Networks   []string
	Entrypoint []string
	WorkingDir string
}

type ComposeConfig struct {
	Version  string
	Services map[string]ServiceInfo
	Networks map[string]interface{}
	Volumes  map[string]interface{}
}

type composeYAML struct {
	Version  string                       `yaml:"version"`
	Services map[string]serviceYAML       `yaml:"services"`
	Networks map[string]interface{}       `yaml:"networks"`
	Volumes  map[string]interface{}       `yaml:"volumes"`
}

type serviceYAML struct {
	Image       string        `yaml:"image"`
	Build       interface{}   `yaml:"build"`
	Command     interface{}   `yaml:"command"`
	Entrypoint  interface{}   `yaml:"entrypoint"`
	Environment interface{}   `yaml:"environment"`
	Ports       []interface{} `yaml:"ports"`
	Volumes     []string      `yaml:"volumes"`
	DependsOn   interface{}   `yaml:"depends_on"`
	Labels      interface{}   `yaml:"labels"`
	Restart     string        `yaml:"restart"`
	Networks    interface{}   `yaml:"networks"`
	WorkingDir  string        `yaml:"working_dir"`
}

func ParseComposeFile(filePath string) (*ComposeConfig, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("读取 compose 文件失败: %w", err)
	}

	var raw composeYAML
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("解析 YAML 失败: %w", err)
	}

	config := &ComposeConfig{
		Version:  raw.Version,
		Services: make(map[string]ServiceInfo),
		Networks: raw.Networks,
		Volumes:  raw.Volumes,
	}

	for name, svc := range raw.Services {
		info := ServiceInfo{
			Name:       name,
			Image:      svc.Image,
			Volumes:    svc.Volumes,
			Restart:    svc.Restart,
			WorkingDir: svc.WorkingDir,
			EnvVars:    make(map[string]string),
			Labels:     make(map[string]string),
		}

		info.Command = parseInterfaceToStringSlice(svc.Command)
		info.Entrypoint = parseInterfaceToStringSlice(svc.Entrypoint)

		for _, p := range svc.Ports {
			info.Ports = append(info.Ports, parsePort(p))
		}

		info.DependsOn = parseDependsOn(svc.DependsOn)
		info.Networks = parseNetworks(svc.Networks)

		parseEnvVars(svc.Environment, info.EnvVars)
		parseLabels(svc.Labels, info.Labels)

		config.Services[name] = info
	}

	return config, nil
}

func parsePort(p interface{}) PortMapping {
	pm := PortMapping{}
	switch v := p.(type) {
	case string:
		parts := strings.SplitN(v, ":", 2)
		if len(parts) == 2 {
			pm.Host = parts[0]
			portProto := strings.SplitN(parts[1], "/", 2)
			pm.Container = portProto[0]
			if len(portProto) == 2 {
				pm.Protocol = portProto[1]
			}
		} else {
			pm.Container = v
			pm.Host = v
		}
	case map[string]interface{}:
		if t, ok := v["target"]; ok {
			pm.Container = fmt.Sprintf("%v", t)
		}
		if p, ok := v["published"]; ok {
			pm.Host = fmt.Sprintf("%v", p)
		}
		if pr, ok := v["protocol"]; ok {
			pm.Protocol = fmt.Sprintf("%v", pr)
		}
	}
	return pm
}

func parseDependsOn(d interface{}) []string {
	var result []string
	switch v := d.(type) {
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
	case map[string]interface{}:
		for key := range v {
			result = append(result, key)
		}
	}
	return result
}

func parseNetworks(n interface{}) []string {
	var result []string
	switch v := n.(type) {
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
	case map[string]interface{}:
		for key := range v {
			result = append(result, key)
		}
	}
	return result
}

func parseEnvVars(env interface{}, target map[string]string) {
	switch v := env.(type) {
	case map[string]interface{}:
		for key, val := range v {
			target[key] = fmt.Sprintf("%v", val)
		}
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				parts := strings.SplitN(s, "=", 2)
				if len(parts) == 2 {
					target[parts[0]] = parts[1]
				} else {
					target[parts[0]] = os.Getenv(parts[0])
				}
			}
		}
	}
}

func parseLabels(l interface{}, target map[string]string) {
	switch v := l.(type) {
	case map[string]interface{}:
		for key, val := range v {
			target[key] = fmt.Sprintf("%v", val)
		}
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				parts := strings.SplitN(s, "=", 2)
				if len(parts) == 2 {
					target[parts[0]] = parts[1]
				}
			}
		}
	}
}

func parseInterfaceToStringSlice(i interface{}) []string {
	var result []string
	switch v := i.(type) {
	case string:
		result = append(result, v)
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
	}
	return result
}
