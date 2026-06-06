// Package reporters provides output formatters for runner results.
package reporters

import (
	"fmt"
	"io"
	"strings"
	"time"

	"gopost/app/pkg/runner"
)

// ConsoleReporter writes pretty terminal output with colors and box-drawing.
type ConsoleReporter struct {
	NoColor bool
}

const (
	colorReset  = "\033[0m"
	colorGreen  = "\033[32m"
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
	colorBold   = "\033[1m"
	colorDim    = "\033[2m"
)

func (r *ConsoleReporter) Write(result *runner.Result, w io.Writer, _ string) error {
	c := func(code string, s string) string {
		if r.NoColor {
			return s
		}
		return code + s + colorReset
	}

	// Header
	header := fmt.Sprintf("%s — %d tests", result.CollectionName, result.Total)
	ruler := strings.Repeat("═", len(header)+4)
	fmt.Fprintf(w, "\n%s\n", c(colorCyan, "╔"+ruler+"╗"))
	fmt.Fprintf(w, "%s\n", c(colorCyan, "║  "+c(colorBold, header)+"  ║"))
	fmt.Fprintf(w, "%s\n", c(colorCyan, "╠"+ruler+"╣"))

	// Results
	for _, req := range result.Requests {
		var status string
		if req.Passed {
			status = c(colorGreen, "✓ "+padRight(req.Method, 7)+req.Name)
		} else {
			status = c(colorRed, "✗ "+padRight(req.Method, 7)+req.Name)
		}

		info := fmt.Sprintf("%s  [%d %s]",
			padRight(status, 50),
			req.Status,
			formatDuration(req.Duration),
		)

		var line string
		if req.Passed {
			line = c(colorGreen, info)
		} else {
			line = c(colorRed, info)
		}

		fmt.Fprintf(w, "%s\n", c(colorCyan, "║  ")+line+c(colorCyan, "  ║"))

		if req.Error != "" {
			errLine := c(colorRed, "   ↳ "+req.Error)
			fmt.Fprintf(w, "%s\n", c(colorCyan, "║  ")+errLine+c(colorCyan, "  ║"))
		}
	}

	// Footer
	summary := fmt.Sprintf("%d passed  %d failed  %s total",
		result.Passed,
		result.Failed,
		formatDuration(int64(result.Duration.Milliseconds())),
	)
	fmt.Fprintf(w, "%s\n", c(colorCyan, "╠"+ruler+"╣"))
	fmt.Fprintf(w, "%s\n", c(colorCyan, "║  "+c(colorBold, summary)+"  ║"))
	fmt.Fprintf(w, "%s\n\n", c(colorCyan, "╚"+ruler+"╝"))

	return nil
}

func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}

func formatDuration(ms int64) string {
	if ms < 1000 {
		return fmt.Sprintf("%dms", ms)
	}
	seconds := float64(ms) / 1000.0
	if seconds < 60 {
		return fmt.Sprintf("%.1fs", seconds)
	}
	d := time.Duration(ms) * time.Millisecond
	return d.String()
}
