package app

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

const resizePrefix = 0x01

type termResize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

func terminalEnv() []string {
	env := os.Environ()
	overrides := map[string]string{
		"TERM":                                "xterm-256color",
		"COLORTERM":                           "truecolor",
		"POSTGO_TERMINAL":                     "1",
		"STARSHIP_SHELL_INTEGRATION":          "false",
		"POWERLEVEL9K_INSTANT_PROMPT":         "off",
		"POWERLEVEL9K_TERM_SHELL_INTEGRATION": "off",
	}
	set := make(map[string]bool, len(overrides))
	for k := range overrides {
		set[k] = true
	}
	out := make([]string, 0, len(env)+len(overrides))
	for _, e := range env {
		key := e
		if i := indexEnvEq(e); i >= 0 {
			key = e[:i]
		}
		if set[key] {
			continue
		}
		out = append(out, e)
	}
	for k, v := range overrides {
		out = append(out, k+"="+v)
	}
	return out
}

func indexEnvEq(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == '=' {
			return i
		}
	}
	return -1
}

func shellCommand() *exec.Cmd {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	switch filepath.Base(shell) {
	case "fish":
		// Skip user config (starship, terminal probes) in embedded web terminal.
		return exec.Command(shell, "--no-config", "-C", "set -g fish_greeting ''")
	case "bash", "zsh":
		return exec.Command(shell, "-i")
	default:
		return exec.Command(shell)
	}
}

func writeToPTY(tty *os.File, msg []byte) error {
	if len(msg) > 1 && msg[0] == resizePrefix {
		var req termResize
		if json.Unmarshal(msg[1:], &req) == nil && req.Cols > 0 && req.Rows > 0 {
			return pty.Setsize(tty, &pty.Winsize{
				Rows: uint16(req.Rows),
				Cols: uint16(req.Cols),
			})
		}
		return nil
	}
	_, err := tty.Write(msg)
	return err
}

// MustGenerateTerminalSecret returns a per-process random token that must be
// present in the WebSocket path to prevent cross-origin access from other
// browser tabs. It panics if the system's CSPRNG fails (catastrophic).
func MustGenerateTerminalSecret() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := strings.ToLower(r.Header.Get("Origin"))
		// Allow wails:// and localhost origins (the Wails webview).
		// In dev mode, Vite serves on localhost:34115 and proxies to Wails.
		if origin == "" {
			return true // no Origin header (native webview, non-browser client)
		}
		return strings.HasPrefix(origin, "wails://") ||
			strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:")
	},
}

func HandleTerminalWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	cmd := shellCommand()
	cmd.Env = terminalEnv()
	cmd.Dir, _ = os.Getwd()

	tty, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		slog.Error("terminal PTY start failed", "error", err)
		return
	}
	defer tty.Close()
	defer cmd.Process.Kill()

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := writeToPTY(tty, msg); err != nil {
				slog.Error("terminal write failed", "error", err)
				return
			}
		}
	}()

	buf := make([]byte, 4096)
	for {
		n, err := tty.Read(buf)
		if err != nil {
			return
		}
		if n > 0 {
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return
			}
		}
	}
}
