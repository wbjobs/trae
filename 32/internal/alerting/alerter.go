package alerting

import (
	"context"
	"regexp"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"ssh-bastion-audit/internal/config"
	"ssh-bastion-audit/internal/database"
)

type compiledRule struct {
	rule    *database.AlertRule
	pattern *regexp.Regexp
}

type Alerter struct {
	ruleRepo    *database.AlertRuleRepository
	rules      []*compiledRule
	rulesMu    sync.RWMutex
	ruleUpdate chan struct{}
	ctx        context.Context
	cancel     context.CancelFunc
}

func NewAlerter(ruleRepo *database.AlertRuleRepository) *Alerter {
	ctx, cancel := context.WithCancel(context.Background())
	return &Alerter{
		ruleRepo:    ruleRepo,
		ruleUpdate: make(chan struct{}, 1),
		ctx:        ctx,
		cancel:     cancel,
	}
}

func (a *Alerter) Start() error {
	if err := a.loadRules(); err != nil {
		return err
	}

	go a.ruleRefreshLoop()

	return nil
}

func (a *Alerter) Stop() {
	a.cancel()
}

func (a *Alerter) loadRules() error {
	rules, err := a.ruleRepo.GetAllEnabled(a.ctx)
	if err != nil {
		return err
	}

	compiled := make([]*compiledRule, 0, len(rules))
	for _, rule := range rules {
		pattern, err := regexp.Compile(rule.Pattern)
		if err != nil {
			logrus.Errorf("Failed to compile rule %s: %v", rule.Name, err)
			continue
		}
		compiled = append(compiled, &compiledRule{
			rule:    rule,
			pattern: pattern,
		})
	}

	a.rulesMu.Lock()
	a.rules = compiled
	a.rulesMu.Unlock()

	logrus.Infof("Loaded %d alert rules", len(compiled))
	return nil
}

func (a *Alerter) ruleRefreshLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			if err := a.loadRules(); err != nil {
				logrus.Errorf("Failed to refresh alert rules: %v", err)
			}
		case <-a.ruleUpdate:
			if err := a.loadRules(); err != nil {
				logrus.Errorf("Failed to refresh alert rules: %v", err)
			}
		}
	}
}

func (a *Alerter) RefreshRules() {
	select {
	case a.ruleUpdate <- struct{}{}:
	default:
	}
}

func (a *Alerter) CheckContent(content string) []database.Alert {
	return a.check(content, false)
}

func (a *Alerter) CheckCommand(command string) []database.Alert {
	return a.check(command, true)
}

func (a *Alerter) check(content string, isCommand bool) []database.Alert {
	a.rulesMu.RLock()
	rules := make([]*compiledRule, len(a.rules))
	copy(rules, a.rules)
	a.rulesMu.RUnlock()

	alerts := make([]database.Alert, 0)

	for _, cr := range rules {
		matches := cr.pattern.FindAllString(content, -1)
		for _, match := range matches {
			alert := database.Alert{
				RuleName:       cr.rule.Name,
				Severity:       cr.rule.Severity,
				MatchedContent: match,
			}
			if isCommand {
				alert.Command = content
			}
			alerts = append(alerts, alert)
		}
	}

	return alerts
}

func (a *Alerter) CheckStream(input string, callback func(alert database.Alert)) {
	alerts := a.CheckContent(input)
	for _, alert := range alerts {
		callback(alert)
	}
}

func (a *Alerter) GetRules() []*database.AlertRule {
	a.rulesMu.RLock()
	defer a.rulesMu.RUnlock()

	rules := make([]*database.AlertRule, 0, len(a.rules))
	for _, cr := range a.rules {
		rules = append(rules, cr.rule)
	}
	return rules
}

func LoadRulesFromConfig(cfg *config.AlertingConfig, ruleRepo *database.AlertRuleRepository) error {
	ctx := context.Background()

	existingRules, err := ruleRepo.List(ctx, 1000, 0)
	if err != nil {
		return err
	}

	existingNames := make(map[string]bool)
	for _, r := range existingRules {
		existingNames[r.Name] = true
	}

	for _, cfgRule := range cfg.Rules {
		if !existingNames[cfgRule.Name] {
			rule := &database.AlertRule{
				Name:        cfgRule.Name,
				Pattern:     cfgRule.Pattern,
				Severity:    cfgRule.Severity,
				Enabled:     cfgRule.Enabled,
				Description: "Loaded from config",
			}
			if err := ruleRepo.Create(ctx, rule); err != nil {
				logrus.Errorf("Failed to create rule %s: %v", cfgRule.Name, err)
			}
		}
	}

	return nil
}
