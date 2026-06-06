package reporters

import (
	"encoding/json"
	"io"

	"gopost/app/pkg/runner"
)

// JSONReporter writes machine-readable JSON output for custom CI pipelines.
type JSONReporter struct{}

// JSONResult wraps the runner result with duration in milliseconds for JSON serialization.
type JSONResult struct {
	CollectionName string              `json:"collection_name"`
	Total          int                 `json:"total"`
	Passed         int                 `json:"passed"`
	Failed         int                 `json:"failed"`
	DurationMs     int64               `json:"duration_ms"`
	Requests       []JSONRequestResult `json:"requests"`
}

// JSONRequestResult is like runner.RequestResult but with snake_case JSON keys.
type JSONRequestResult struct {
	Name     string `json:"name"`
	Method   string `json:"method"`
	URL      string `json:"url"`
	Status   int    `json:"status"`
	Passed   bool   `json:"passed"`
	Duration int64  `json:"duration_ms"`
	Error    string `json:"error,omitempty"`
}

func (r *JSONReporter) Write(result *runner.Result, w io.Writer, _ string) error {
	jr := JSONResult{
		CollectionName: result.CollectionName,
		Total:          result.Total,
		Passed:         result.Passed,
		Failed:         result.Failed,
		DurationMs:     result.Duration.Milliseconds(),
	}

	for _, req := range result.Requests {
		jr.Requests = append(jr.Requests, JSONRequestResult{
			Name:     req.Name,
			Method:   req.Method,
			URL:      req.URL,
			Status:   req.Status,
			Passed:   req.Passed,
			Duration: req.Duration,
			Error:    req.Error,
		})
	}

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(jr)
}
