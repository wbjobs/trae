package tui

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jroimartin/gocui"

	dockerclient "docker-compose-tui/docker"
	"docker-compose-tui/parser"
)

const (
	viewServices = "services"
	viewDetail   = "detail"
	viewBottom   = "bottom"
	viewHelp     = "help"
	viewStatus   = "status"
	viewTitle    = "title"
)

type App struct {
	gui          *gocui.Gui
	dockerCli    *dockerclient.DockerClient
	compose      *parser.ComposeConfig
	projectName  string
	depGraph     *depGraph
	composeFile  string

	serviceList  []string
	currentIndex int

	mu           sync.RWMutex
	containers   map[string]*dockerclient.ContainerStatus
	stats        map[string]*dockerclient.ContainerStats
	logLines     []string
	stopChan     chan struct{}
	logStopChan  chan struct{}
	logActive    bool
	showStats    bool

	fileModTime  time.Time
	pendingReload bool
	pendingDiff   *configDiff
}

func NewApp(compose *parser.ComposeConfig, projectName string, dockerCli *dockerclient.DockerClient, composeFile string) *App {
	var modTime time.Time
	if info, err := os.Stat(composeFile); err == nil {
		modTime = info.ModTime()
	}

	return &App{
		compose:     compose,
		projectName: projectName,
		dockerCli:   dockerCli,
		depGraph:    buildDepGraph(compose),
		composeFile: composeFile,
		containers:  make(map[string]*dockerclient.ContainerStatus),
		stats:       make(map[string]*dockerclient.ContainerStats),
		stopChan:    make(chan struct{}),
		showStats:   true,
		fileModTime: modTime,
	}
}

func (a *App) Run() error {
	g, err := gocui.NewGui(gocui.OutputNormal)
	if err != nil {
		return fmt.Errorf("创建 TUI 失败: %w", err)
	}
	defer g.Close()

	a.gui = g
	g.Cursor = false
	g.Mouse = false
	g.Highlight = true
	g.SelFgColor = gocui.ColorGreen

	a.buildServiceList()

	g.SetManagerFunc(a.layout)

	if err := a.setKeybindings(g); err != nil {
		return err
	}

	go a.refreshLoop()

	err = g.MainLoop()
	close(a.stopChan)
	return err
}

func (a *App) buildServiceList() {
	a.serviceList = make([]string, 0, len(a.compose.Services))
	for name := range a.compose.Services {
		a.serviceList = append(a.serviceList, name)
	}
	sort.Strings(a.serviceList)
}

func (a *App) layout(g *gocui.Gui) error {
	maxX, maxY := g.Size()

	if v, err := g.SetView(viewTitle, 0, 0, maxX-1, 2); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		if a.pendingReload {
			v.FgColor = gocui.ColorRed
			fmt.Fprintf(v, " !! COMPOSE FILE CHANGED !! 按 y 确认重载 / n 取消  |  Project: %s", a.projectName)
		} else {
			v.FgColor = gocui.ColorCyan
			fmt.Fprintf(v, " Docker Compose TUI  |  Project: %s  |  %s", a.projectName, time.Now().Format("15:04:05"))
		}
	}

	helpText := " ↑↓选择  s启动  x停止(含依赖)  X停止全部  r重启  l日志  m指标  y确认重载  n取消  q退出 "
	if v, err := g.SetView(viewHelp, 0, maxY-2, maxX-1, maxY-1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		v.FgColor = gocui.ColorYellow
		fmt.Fprint(v, helpText)
	}

	if v, err := g.SetView(viewStatus, 0, maxY-3, maxX-1, maxY-3); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		v.FgColor = gocui.ColorMagenta
		a.renderStatus(v)
	}

	servicesWidth := maxX / 3
	if servicesWidth < 30 {
		servicesWidth = 30
	}

	if v, err := g.SetView(viewServices, 0, 3, servicesWidth, maxY-4); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Title = " Services "
		v.Highlight = true
		v.SelFgColor = gocui.ColorGreen
		a.renderServices(v)

		if a.currentIndex >= len(a.serviceList) {
			a.currentIndex = 0
		}
		if _, err := g.SetCurrentView(viewServices); err != nil {
			return err
		}
	}

	detailX := servicesWidth + 1
	midY := (maxY - 7) / 2 + 3
	if midY < 10 {
		midY = 10
	}

	if v, err := g.SetView(viewDetail, detailX, 3, maxX-1, midY); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Title = " Service Details "
		a.renderDetail(v)
	}

	if v, err := g.SetView(viewBottom, detailX, midY+1, maxX-1, maxY-4); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		if a.pendingReload && a.pendingDiff != nil {
			v.Title = " Pending Changes [y=apply n=dismiss] "
			v.Autoscroll = false
			v.Wrap = false
			a.renderPendingChanges(v)
		} else if a.logActive {
			v.Title = " Logs (tail -f) [按 l 关闭] "
			v.Autoscroll = true
			v.Wrap = true
			a.renderLogs(v)
		} else {
			v.Title = " Resource Monitor "
			v.Autoscroll = false
			v.Wrap = false
			a.renderStats(v)
		}
	}

	return nil
}

func (a *App) renderServices(v *gocui.View) {
	v.Clear()
	a.mu.RLock()
	defer a.mu.RUnlock()

	for i, name := range a.serviceList {
		svc := a.compose.Services[name]
		c, hasContainer := a.containers[name]

		state := "  "
		if hasContainer {
			if c.Running {
				state = "▶ "
			} else {
				state = "■ "
			}
		}

		image := svc.Image
		if image == "" {
			image = "(build)"
		}
		if len(image) > 20 {
			image = image[:20] + "..."
		}

		fmt.Fprintf(v, "%s%-20s %s\n", state, name, image)

		if i == a.currentIndex && hasContainer && c.Running {
			if s, ok := a.stats[name]; ok {
				fmt.Fprintf(v, "   CPU: %.1f%%  MEM: %.1f%% (%s)\n",
					s.CPUPercent, s.MemPercent, formatBytes(s.MemUsage))
			} else {
				fmt.Fprintf(v, "   CPU: --.-%%  MEM: --.-%%\n")
			}
		}
	}
}

func (a *App) renderDetail(v *gocui.View) {
	v.Clear()
	if a.currentIndex >= len(a.serviceList) {
		return
	}

	name := a.serviceList[a.currentIndex]
	svc := a.compose.Services[name]

	a.mu.RLock()
	c := a.containers[name]
	a.mu.RUnlock()

	fmt.Fprintf(v, "  Name:      %s\n", name)
	fmt.Fprintf(v, "  Image:     %s\n", svc.Image)

	if c != nil {
		stateColor := gocui.ColorRed
		if c.Running {
			stateColor = gocui.ColorGreen
		}
		fmt.Fprintf(v, "  State:     ")
		v.FgColor = stateColor
		fmt.Fprintf(v, "%s", c.State)
		v.FgColor = gocui.ColorDefault
		fmt.Fprintf(v, " (%s)\n", c.Status)
		fmt.Fprintf(v, "  Container: %s\n", c.Name)
		fmt.Fprintf(v, "  IP:        %s\n", c.IP)
		fmt.Fprintf(v, "  Created:   %s\n", c.CreatedAt)
	} else {
		fmt.Fprintf(v, "  State:     not deployed\n")
	}

	if len(svc.Ports) > 0 {
		ports := make([]string, 0, len(svc.Ports))
		for _, p := range svc.Ports {
			portStr := p.Host
			if p.Protocol != "" {
				portStr += "/" + p.Protocol
			}
			ports = append(ports, fmt.Sprintf("%s->%s", portStr, p.Container))
		}
		fmt.Fprintf(v, "  Ports:     %s\n", strings.Join(ports, ", "))
	}

	if len(svc.DependsOn) > 0 {
		fmt.Fprintf(v, "  Depends:   %s\n", strings.Join(svc.DependsOn, ", "))
	}

	dependents := a.depGraph.dependentsOf(name)
	if len(dependents) > 0 {
		fmt.Fprintf(v, "  Used by:   %s\n", strings.Join(dependents, ", "))
	}

	stopOrder := a.depGraph.stopOrderFor(name)
	if len(stopOrder) > 1 {
		fmt.Fprintf(v, "  Stop Seq:  %s\n", strings.Join(stopOrder, " -> "))
	}

	if len(svc.Networks) > 0 {
		fmt.Fprintf(v, "  Networks:  %s\n", strings.Join(svc.Networks, ", "))
	}

	if len(svc.Volumes) > 0 {
		vols := svc.Volumes
		if len(vols) > 3 {
			vols = append(vols[:3], "...")
		}
		fmt.Fprintf(v, "  Volumes:   %s\n", strings.Join(vols, ", "))
	}

	if len(svc.EnvVars) > 0 {
		envKeys := make([]string, 0, len(svc.EnvVars))
		for k := range svc.EnvVars {
			envKeys = append(envKeys, k)
		}
		sort.Strings(envKeys)
		if len(envKeys) > 5 {
			envKeys = append(envKeys[:5], "...")
		}
		fmt.Fprintf(v, "  Env:       %s\n", strings.Join(envKeys, ", "))
	}

	if svc.Restart != "" {
		fmt.Fprintf(v, "  Restart:   %s\n", svc.Restart)
	}

	if svc.WorkingDir != "" {
		fmt.Fprintf(v, "  WorkDir:   %s\n", svc.WorkingDir)
	}
}

func (a *App) toggleStatsMode(g *gocui.Gui, v *gocui.View) error {
	a.showStats = !a.showStats
	return nil
}

func (a *App) renderStats(v *gocui.View) {
	v.Clear()
	a.mu.RLock()
	defer a.mu.RUnlock()

	if !a.showStats && a.currentIndex < len(a.serviceList) {
		name := a.serviceList[a.currentIndex]
		c := a.containers[name]
		if c != nil && c.Running {
			s := a.stats[name]
			if s != nil {
				fmt.Fprintf(v, "  Selected Service: %s\n\n", name)
				fmt.Fprintf(v, "  CPU Usage:    %.1f%%\n", s.CPUPercent)
				fmt.Fprintf(v, "  Memory Usage: %.1f%% (%s / %s)\n",
					s.MemPercent, formatBytes(s.MemUsage), formatBytes(s.MemLimit))
				fmt.Fprintf(v, "  Net I/O:      %s in / %s out\n",
					formatBytes(s.NetInput), formatBytes(s.NetOutput))
				fmt.Fprintf(v, "  Block I/O:    %s read / %s write\n",
					formatBytes(s.BlockInput), formatBytes(s.BlockOutput))
				fmt.Fprintf(v, "\n  Timestamp: %s\n", s.Timestamp.Format("15:04:05"))
				return
			}
		}
		fmt.Fprintf(v, "  Selected Service: %s\n", name)
		if c == nil {
			fmt.Fprintf(v, "  (not deployed)\n")
		} else if !c.Running {
			fmt.Fprintf(v, "  (not running)\n")
		} else {
			fmt.Fprintf(v, "  (collecting stats...)\n")
		}
		return
	}

	fmt.Fprintf(v, "%-20s %10s %10s %15s %15s\n",
		"Service", "CPU%", "MEM%", "Net I/O", "Block I/O")
	fmt.Fprintf(v, "%s\n", strings.Repeat("─", 80))

	for _, name := range a.serviceList {
		c := a.containers[name]
		if c == nil || !c.Running {
			continue
		}

		s := a.stats[name]
		if s == nil {
			fmt.Fprintf(v, "%-20s %10s %10s %15s %15s\n",
				name, "-", "-", "-", "-")
			continue
		}

		netStr := fmt.Sprintf("%s/%s",
			formatBytes(s.NetInput), formatBytes(s.NetOutput))
		blockStr := fmt.Sprintf("%s/%s",
			formatBytes(s.BlockInput), formatBytes(s.BlockOutput))

		fmt.Fprintf(v, "%-20s %9.1f%% %9.1f%% %15s %15s\n",
			name, s.CPUPercent, s.MemPercent, netStr, blockStr)
	}

	if len(a.serviceList) > 0 {
		fmt.Fprintf(v, "\n  Refresh: %s  |  Press 'm' to toggle detail\n",
			time.Now().Format("15:04:05"))
	}
}

func (a *App) renderLogs(v *gocui.View) {
	v.Clear()
	a.mu.RLock()
	defer a.mu.RUnlock()

	for _, line := range a.logLines {
		fmt.Fprintln(v, line)
	}
}

func (a *App) renderPendingChanges(v *gocui.View) {
	v.Clear()
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.pendingDiff == nil {
		return
	}

	fmt.Fprintf(v, "  File: %s\n\n", a.composeFile)

	if len(a.pendingDiff.Added) > 0 {
		v.FgColor = gocui.ColorGreen
		fmt.Fprintf(v, "  [ADDED] %d service(s):\n", len(a.pendingDiff.Added))
		v.FgColor = gocui.ColorDefault
		for _, name := range a.pendingDiff.Added {
			fmt.Fprintf(v, "    + %s\n", name)
		}
		fmt.Fprintf(v, "\n")
	}

	if len(a.pendingDiff.Removed) > 0 {
		v.FgColor = gocui.ColorRed
		fmt.Fprintf(v, "  [REMOVED] %d service(s):\n", len(a.pendingDiff.Removed))
		v.FgColor = gocui.ColorDefault
		for _, name := range a.pendingDiff.Removed {
			fmt.Fprintf(v, "    - %s\n", name)
		}
		fmt.Fprintf(v, "\n")
	}

	if len(a.pendingDiff.Modified) > 0 {
		v.FgColor = gocui.ColorYellow
		fmt.Fprintf(v, "  [MODIFIED] %d field(s):\n", len(a.pendingDiff.Modified))
		v.FgColor = gocui.ColorDefault
		for _, ch := range a.pendingDiff.Modified {
			fmt.Fprintf(v, "    ~ %s.%s\n", ch.Service, ch.Field)
			fmt.Fprintf(v, "      old: %s\n", ch.Old)
			fmt.Fprintf(v, "      new: %s\n", ch.New)
		}
		fmt.Fprintf(v, "\n")
	}

	fmt.Fprintf(v, "  Press 'y' to apply changes  |  Press 'n' to dismiss\n")
}

func (a *App) renderStatus(v *gocui.View) {
	v.Clear()
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.pendingReload && a.pendingDiff != nil {
		var parts []string
		if len(a.pendingDiff.Added) > 0 {
			parts = append(parts, fmt.Sprintf("+%d", len(a.pendingDiff.Added)))
		}
		if len(a.pendingDiff.Removed) > 0 {
			parts = append(parts, fmt.Sprintf("-%d", len(a.pendingDiff.Removed)))
		}
		if len(a.pendingDiff.Modified) > 0 {
			parts = append(parts, fmt.Sprintf("~%d", len(a.pendingDiff.Modified)))
		}
		fmt.Fprintf(v, " 配置变更: %s  按 y 确认重载 / n 取消", strings.Join(parts, " "))
		return
	}

	running := 0
	total := 0
	for _, c := range a.containers {
		total++
		if c.Running {
			running++
		}
	}

	status := fmt.Sprintf(" Services: %d  |  Containers: %d  |  Running: %d  |  Stopped: %d",
		len(a.serviceList), total, running, total-running)
	fmt.Fprint(v, status)
}

func (a *App) setKeybindings(g *gocui.Gui) error {
	if err := g.SetKeybinding("", gocui.KeyCtrlC, gocui.ModNone, a.quit); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'q', gocui.ModNone, a.quit); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'Q', gocui.ModNone, a.quit); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, gocui.KeyArrowUp, gocui.ModNone, a.cursorUp); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, gocui.KeyArrowDown, gocui.ModNone, a.cursorDown); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 's', gocui.ModNone, a.startService); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'S', gocui.ModNone, a.startService); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 'x', gocui.ModNone, a.stopService); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'X', gocui.ModNone, a.stopAllServices); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 'r', gocui.ModNone, a.restartService); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'R', gocui.ModNone, a.restartService); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 'l', gocui.ModNone, a.toggleLogs); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'L', gocui.ModNone, a.toggleLogs); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 'm', gocui.ModNone, a.toggleStatsMode); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'M', gocui.ModNone, a.toggleStatsMode); err != nil {
		return err
	}

	if err := g.SetKeybinding(viewServices, 'y', gocui.ModNone, a.applyReload); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'Y', gocui.ModNone, a.applyReload); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'n', gocui.ModNone, a.dismissReload); err != nil {
		return err
	}
	if err := g.SetKeybinding(viewServices, 'N', gocui.ModNone, a.dismissReload); err != nil {
		return err
	}

	return nil
}

func (a *App) quit(g *gocui.Gui, v *gocui.View) error {
	return gocui.ErrQuit
}

func (a *App) cursorUp(g *gocui.Gui, v *gocui.View) error {
	if a.currentIndex > 0 {
		a.currentIndex--
	}
	a.logActive = false
	if a.logStopChan != nil {
		close(a.logStopChan)
		a.logStopChan = nil
	}
	return nil
}

func (a *App) cursorDown(g *gocui.Gui, v *gocui.View) error {
	if a.currentIndex < len(a.serviceList)-1 {
		a.currentIndex++
	}
	a.logActive = false
	if a.logStopChan != nil {
		close(a.logStopChan)
		a.logStopChan = nil
	}
	return nil
}

func (a *App) startService(g *gocui.Gui, v *gocui.View) error {
	name := a.serviceList[a.currentIndex]
	a.mu.RLock()
	c := a.containers[name]
	a.mu.RUnlock()

	if c != nil {
		go func() {
			if err := a.dockerCli.StartContainer(c.ID); err != nil {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("启动 %s 失败: %v", name, err))
					return nil
				})
			} else {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("已启动: %s", name))
					return nil
				})
			}
		}()
	} else {
		a.showStatus(fmt.Sprintf("容器 %s 未部署", name))
	}
	return nil
}

func (a *App) stopService(g *gocui.Gui, v *gocui.View) error {
	name := a.serviceList[a.currentIndex]
	a.mu.RLock()
	c := a.containers[name]
	a.mu.RUnlock()

	if c == nil {
		a.showStatus(fmt.Sprintf("容器 %s 未部署", name))
		return nil
	}

	dependents := a.depGraph.dependentsOf(name)
	if len(dependents) > 0 {
		go func() {
			order := a.depGraph.stopOrderFor(name)
			var stopped []string
			for _, svc := range order {
				a.mu.RLock()
				cc := a.containers[svc]
				a.mu.RUnlock()
				if cc != nil && cc.Running {
					if err := a.dockerCli.StopContainer(cc.ID); err != nil {
						a.gui.Update(func(g *gocui.Gui) error {
							a.showStatus(fmt.Sprintf("停止 %s 失败: %v", svc, err))
							return nil
						})
						continue
					}
					stopped = append(stopped, svc)
				}
			}
			a.gui.Update(func(g *gocui.Gui) error {
				a.showStatus(fmt.Sprintf("已停止 %d 个服务: %s", len(stopped), strings.Join(stopped, " -> ")))
				return nil
			})
		}()
	} else {
		go func() {
			if err := a.dockerCli.StopContainer(c.ID); err != nil {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("停止 %s 失败: %v", name, err))
					return nil
				})
			} else {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("已停止: %s", name))
					return nil
				})
			}
		}()
	}
	return nil
}

func (a *App) stopAllServices(g *gocui.Gui, v *gocui.View) error {
	stopOrder := a.depGraph.stopOrder()

	go func() {
		var stopped []string
		for _, svc := range stopOrder {
			a.mu.RLock()
			cc := a.containers[svc]
			a.mu.RUnlock()
			if cc != nil && cc.Running {
				if err := a.dockerCli.StopContainer(cc.ID); err != nil {
					a.gui.Update(func(g *gocui.Gui) error {
						a.showStatus(fmt.Sprintf("停止 %s 失败: %v (继续停止其他服务)", svc, err))
						return nil
					})
					continue
				}
				stopped = append(stopped, svc)
			}
		}
		a.gui.Update(func(g *gocui.Gui) error {
			if len(stopped) > 0 {
				a.showStatus(fmt.Sprintf("已按依赖顺序停止 %d 个服务: %s", len(stopped), strings.Join(stopped, " -> ")))
			} else {
				a.showStatus("没有正在运行的服务")
			}
			return nil
		})
	}()

	return nil
}

func (a *App) restartService(g *gocui.Gui, v *gocui.View) error {
	name := a.serviceList[a.currentIndex]
	a.mu.RLock()
	c := a.containers[name]
	a.mu.RUnlock()

	if c != nil {
		go func() {
			if err := a.dockerCli.RestartContainer(c.ID); err != nil {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("重启 %s 失败: %v", name, err))
					return nil
				})
			} else {
				a.gui.Update(func(g *gocui.Gui) error {
					a.showStatus(fmt.Sprintf("已重启: %s", name))
					return nil
				})
			}
		}()
	}
	return nil
}

func (a *App) toggleLogs(g *gocui.Gui, v *gocui.View) error {
	a.logActive = !a.logActive

	if !a.logActive {
		if a.logStopChan != nil {
			close(a.logStopChan)
			a.logStopChan = nil
		}
		a.logLines = nil
		return nil
	}

	name := a.serviceList[a.currentIndex]
	a.mu.RLock()
	c := a.containers[name]
	a.mu.RUnlock()

	if c == nil {
		a.showStatus(fmt.Sprintf("容器 %s 未部署", name))
		a.logActive = false
		return nil
	}

	a.logLines = nil
	stopCh := make(chan struct{})
	a.logStopChan = stopCh

	go func() {
		logChan, err := a.dockerCli.GetContainerLogs(c.ID, 100)
		if err != nil {
			a.gui.Update(func(g *gocui.Gui) error {
				a.showStatus(fmt.Sprintf("获取日志失败: %v", err))
				return nil
			})
			return
		}

		for {
			select {
			case <-stopCh:
				return
			case line, ok := <-logChan:
				if !ok {
					return
				}
				a.mu.Lock()
				a.logLines = append(a.logLines, line)
				if len(a.logLines) > 500 {
					a.logLines = a.logLines[len(a.logLines)-500:]
				}
				a.mu.Unlock()
			}
		}
	}()

	return nil
}

func (a *App) showStatus(msg string) {
	if a.gui == nil {
		return
	}
	a.gui.Update(func(g *gocui.Gui) error {
		if v, err := g.View(viewStatus); err == nil {
			v.Clear()
			v.FgColor = gocui.ColorMagenta
			fmt.Fprint(v, " ", msg)
		}
		return nil
	})
}

func (a *App) applyReload(g *gocui.Gui, v *gocui.View) error {
	a.mu.Lock()
	if !a.pendingReload {
		a.mu.Unlock()
		return nil
	}
	diff := a.pendingDiff
	a.mu.Unlock()

	newConfig, err := parser.ParseComposeFile(a.composeFile)
	if err != nil {
		a.showStatus(fmt.Sprintf("重载失败: %v", err))
		a.dismissReload(g, v)
		return nil
	}

	a.mu.Lock()
	a.compose = newConfig
	a.depGraph = buildDepGraph(newConfig)
	a.pendingReload = false
	a.pendingDiff = nil
	a.mu.Unlock()

	a.buildServiceList()

	if a.currentIndex >= len(a.serviceList) {
		a.currentIndex = 0
	}

	var parts []string
	if len(diff.Added) > 0 {
		parts = append(parts, fmt.Sprintf("新增 %d 个服务", len(diff.Added)))
	}
	if len(diff.Removed) > 0 {
		parts = append(parts, fmt.Sprintf("移除 %d 个服务", len(diff.Removed)))
	}
	if len(diff.Modified) > 0 {
		parts = append(parts, fmt.Sprintf("修改 %d 个字段", len(diff.Modified)))
	}

	a.showStatus(fmt.Sprintf("配置已重载: %s", strings.Join(parts, ", ")))
	return nil
}

func (a *App) dismissReload(g *gocui.Gui, v *gocui.View) error {
	a.mu.Lock()
	a.pendingReload = false
	a.pendingDiff = nil
	a.mu.Unlock()

	info, err := os.Stat(a.composeFile)
	if err == nil {
		a.fileModTime = info.ModTime()
	}

	a.showStatus("已忽略配置变更")
	return nil
}

func (a *App) refreshLoop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.stopChan:
			return
		case <-ticker.C:
			a.checkFileChange()
			a.refreshContainers()
			a.refreshStats()

			if a.gui != nil {
				a.gui.Update(func(g *gocui.Gui) error {
					return nil
				})
			}
		}
	}
}

func (a *App) checkFileChange() {
	if a.pendingReload {
		return
	}

	info, err := os.Stat(a.composeFile)
	if err != nil {
		return
	}

	if info.ModTime().After(a.fileModTime) {
		newConfig, err := parser.ParseComposeFile(a.composeFile)
		if err != nil {
			a.fileModTime = info.ModTime()
			return
		}

		diff := computeDiff(a.compose, newConfig)
		if diff.hasChanges() {
			a.mu.Lock()
			a.pendingReload = true
			a.pendingDiff = diff
			a.mu.Unlock()
		}

		a.fileModTime = info.ModTime()
	}
}

func (a *App) refreshContainers() {
	services := make([]string, 0, len(a.compose.Services))
	for name := range a.compose.Services {
		services = append(services, name)
	}

	containers, err := a.dockerCli.ListContainers(a.projectName, services)
	if err != nil {
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.containers = make(map[string]*dockerclient.ContainerStatus)
	for i := range containers {
		a.containers[containers[i].Service] = &containers[i]
	}
}

func (a *App) refreshStats() {
	a.mu.RLock()
	containerIDs := make([]string, 0, len(a.containers))
	containerMap := make(map[string]string)
	for svc, c := range a.containers {
		if c.Running {
			containerIDs = append(containerIDs, c.ID)
			containerMap[c.ID] = svc
		}
	}
	a.mu.RUnlock()

	if len(containerIDs) == 0 {
		return
	}

	stats, err := a.dockerCli.GetAllContainerStats(containerIDs)
	if err != nil {
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	for id, s := range stats {
		if svc, ok := containerMap[id]; ok {
			a.stats[svc] = s
		}
	}
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
