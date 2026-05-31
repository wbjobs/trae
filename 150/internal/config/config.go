package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type AuthConfig struct {
	Type     string `yaml:"type"`
	Password string `yaml:"password"`
	KeyPath  string `yaml:"key_path"`
}

type ServerConfig struct {
	Name       string     `yaml:"name"`
	Host       string     `yaml:"host"`
	Port       int        `yaml:"port"`
	User       string     `yaml:"user"`
	Auth       AuthConfig `yaml:"auth"`
	JumpHost   string     `yaml:"jump_host,omitempty"`
	JumpPort   int        `yaml:"jump_port,omitempty"`
	JumpUser   string     `yaml:"jump_user,omitempty"`
	JumpAuth   AuthConfig `yaml:"jump_auth,omitempty"`
	Record     bool       `yaml:"record"`
	RecordDir  string     `yaml:"record_dir"`
	ShareID    string     `yaml:"-"`
	IsShared   bool       `yaml:"-"`
}

type Config struct {
	Servers []ServerConfig `yaml:"servers"`
}

func Load(path string) (*Config, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve config path: %w", err)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	for i := range cfg.Servers {
		if cfg.Servers[i].Port == 0 {
			cfg.Servers[i].Port = 22
		}
		if cfg.Servers[i].JumpPort == 0 {
			cfg.Servers[i].JumpPort = 22
		}
	}

	return &cfg, nil
}

func (c *Config) GetServer(name string) *ServerConfig {
	for i := range c.Servers {
		if c.Servers[i].Name == name {
			return &c.Servers[i]
		}
	}
	return nil
}

func (c *Config) ServerNames() []string {
	names := make([]string, len(c.Servers))
	for i, s := range c.Servers {
		names[i] = s.Name
	}
	return names
}
