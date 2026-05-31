package audit

import (
	"strings"
	"sync"
	"unicode"
)

type CommandExtractor struct {
	mu         sync.Mutex
	buffer     strings.Builder
	sessionID  string
	server     string
	user       string
	onCommand  func(cmd string)
}

func NewCommandExtractor(sessionID, server, user string, onCommand func(cmd string)) *CommandExtractor {
	return &CommandExtractor{
		sessionID: sessionID,
		server:    server,
		user:      user,
		onCommand: onCommand,
	}
}

func (e *CommandExtractor) Feed(data []byte) {
	e.mu.Lock()
	defer e.mu.Unlock()

	for _, b := range data {
		switch b {
		case '\r', '\n':
			e.flush()
		case 3:
			e.buffer.Reset()
		case 4:
			e.flush()
		case 127, 8:
			if e.buffer.Len() > 0 {
				s := e.buffer.String()
				e.buffer.Reset()
				e.buffer.WriteString(s[:len(s)-1])
			}
		case '\t':
		default:
			if unicode.IsPrint(rune(b)) {
				e.buffer.WriteByte(b)
			}
		}
	}
}

func (e *CommandExtractor) flush() {
	cmd := strings.TrimSpace(e.buffer.String())
	e.buffer.Reset()

	if cmd == "" {
		return
	}

	cmd = cleanCommand(cmd)
	if cmd != "" && e.onCommand != nil {
		e.onCommand(cmd)
	}
}

func cleanCommand(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return ""
	}

	if strings.HasPrefix(cmd, "sudo ") {
		cmd = strings.TrimPrefix(cmd, "sudo ")
	} else if strings.HasPrefix(cmd, "doas ") {
		cmd = strings.TrimPrefix(cmd, "doas ")
	}

	fields := strings.Fields(cmd)
	if len(fields) == 0 {
		return ""
	}

	baseCmd := fields[0]
	if baseCmd == "cd" || baseCmd == "ls" || baseCmd == "pwd" ||
		baseCmd == "cat" || baseCmd == "echo" || baseCmd == "mkdir" ||
		baseCmd == "rm" || baseCmd == "cp" || baseCmd == "mv" ||
		baseCmd == "grep" || baseCmd == "find" || baseCmd == "ps" ||
		baseCmd == "kill" || baseCmd == "top" || baseCmd == "htop" ||
		baseCmd == "df" || baseCmd == "du" || baseCmd == "free" ||
		baseCmd == "uname" || baseCmd == "whoami" || baseCmd == "id" ||
		baseCmd == "date" || baseCmd == "history" || baseCmd == "clear" ||
		baseCmd == "exit" || baseCmd == "logout" || baseCmd == "which" ||
		baseCmd == "whereis" || baseCmd == "file" || baseCmd == "stat" ||
		baseCmd == "chmod" || baseCmd == "chown" || baseCmd == "chgrp" ||
		baseCmd == "tar" || baseCmd == "zip" || baseCmd == "unzip" ||
		baseCmd == "curl" || baseCmd == "wget" || baseCmd == "ssh" ||
		baseCmd == "scp" || baseCmd == "rsync" || baseCmd == "git" ||
		baseCmd == "docker" || baseCmd == "kubectl" || baseCmd == "systemctl" ||
		baseCmd == "apt" || baseCmd == "apt-get" || baseCmd == "yum" ||
		baseCmd == "dnf" || baseCmd == "pacman" || baseCmd == "brew" ||
		baseCmd == "pip" || baseCmd == "npm" || baseCmd == "go" ||
		baseCmd == "python" || baseCmd == "python3" || baseCmd == "node" ||
		baseCmd == "java" || baseCmd == "vim" || baseCmd == "vi" ||
		baseCmd == "nano" || baseCmd == "emacs" || baseCmd == "tail" ||
		baseCmd == "head" || baseCmd == "less" || baseCmd == "more" ||
		baseCmd == "wc" || baseCmd == "sort" || baseCmd == "uniq" ||
		baseCmd == "awk" || baseCmd == "sed" || baseCmd == "tee" ||
		baseCmd == "killall" || baseCmd == "pkill" || baseCmd == "pgrep" ||
		baseCmd == "netstat" || baseCmd == "ss" || baseCmd == "ip" ||
		baseCmd == "ifconfig" || baseCmd == "ping" || baseCmd == "traceroute" ||
		baseCmd == "nslookup" || baseCmd == "dig" || baseCmd == "host" ||
		baseCmd == "iptables" || baseCmd == "ufw" || baseCmd == "firewall-cmd" ||
		baseCmd == "journalctl" || baseCmd == "dmesg" || baseCmd == "syslog" {
		return baseCmd + " " + strings.Join(fields[1:], " ")
	}

	return cmd
}

func (e *CommandExtractor) Reset() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.buffer.Reset()
}
