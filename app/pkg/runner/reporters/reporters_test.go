package reporters

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"strings"
	"testing"
	"time"

	"gopost/app/pkg/runner"
)

// ==================== Helpers ====================

func makeResult(name string, requests []runner.RequestResult) *runner.Result {
	total, passed, failed := len(requests), 0, 0
	for _, r := range requests {
		if r.Passed {
			passed++
		} else {
			failed++
		}
	}
	return &runner.Result{
		CollectionName: name,
		Total:          total,
		Passed:         passed,
		Failed:         failed,
		Duration:       250 * time.Millisecond,
		Requests:       requests,
	}
}

var allPassed = []runner.RequestResult{
	{Name: "Get Users", Method: "GET", URL: "https://example.com/users", Status: 200, Passed: true, Duration: 45},
	{Name: "Create User", Method: "POST", URL: "https://example.com/users", Status: 201, Passed: true, Duration: 88},
}

var withFailure = []runner.RequestResult{
	{Name: "Get Users", Method: "GET", URL: "https://example.com/users", Status: 200, Passed: true, Duration: 45},
	{Name: "Delete User", Method: "DELETE", URL: "https://example.com/users/99", Status: 404, Passed: false, Duration: 12, Error: "expected 2xx, got 404"},
}

// ==================== JUnit ====================

func TestJUnit_AllPassed(t *testing.T) {
	r := &JUnitReporter{}
	result := makeResult("MyAPI", allPassed)
	var buf bytes.Buffer
	if err := r.Write(result, &buf, ""); err != nil {
		t.Fatalf("write: %v", err)
	}

	var suite JUnitTestSuite
	if err := xml.Unmarshal(buf.Bytes()[len(xml.Header):], &suite); err != nil {
		t.Fatalf("parse XML: %v\noutput:\n%s", err, buf.String())
	}
	if suite.Name != "MyAPI" {
		t.Errorf("Name: want 'MyAPI', got %q", suite.Name)
	}
	if suite.Tests != 2 {
		t.Errorf("Tests: want 2, got %d", suite.Tests)
	}
	if suite.Failures != 0 {
		t.Errorf("Failures: want 0, got %d", suite.Failures)
	}
	if len(suite.TestCases) != 2 {
		t.Errorf("TestCases: want 2, got %d", len(suite.TestCases))
	}
}

func TestJUnit_WithFailure(t *testing.T) {
	r := &JUnitReporter{}
	result := makeResult("MyAPI", withFailure)
	var buf bytes.Buffer
	r.Write(result, &buf, "")

	var suite JUnitTestSuite
	xml.Unmarshal(buf.Bytes()[len(xml.Header):], &suite)

	if suite.Failures != 1 {
		t.Errorf("Failures: want 1, got %d", suite.Failures)
	}

	var failedCase *JUnitTestCase
	for i := range suite.TestCases {
		if suite.TestCases[i].Name == "Delete User" {
			failedCase = &suite.TestCases[i]
			break
		}
	}
	if failedCase == nil {
		t.Fatal("could not find 'Delete User' test case")
	}
	if failedCase.Failure == nil {
		t.Error("failed case should have a <failure> element")
	}
	if !strings.Contains(failedCase.Failure.Content, "DELETE") {
		t.Errorf("failure content should mention method, got: %s", failedCase.Failure.Content)
	}
}

func TestJUnit_ClassnameFormat(t *testing.T) {
	r := &JUnitReporter{}
	result := makeResult("Pets", allPassed)
	var buf bytes.Buffer
	r.Write(result, &buf, "")

	var suite JUnitTestSuite
	xml.Unmarshal(buf.Bytes()[len(xml.Header):], &suite)

	// Classname should be "CollectionName.Method"
	if !strings.HasPrefix(suite.TestCases[0].Classname, "Pets.") {
		t.Errorf("Classname should start with 'Pets.', got %q", suite.TestCases[0].Classname)
	}
}

func TestJUnit_EmptyResult(t *testing.T) {
	r := &JUnitReporter{}
	result := makeResult("Empty", []runner.RequestResult{})
	var buf bytes.Buffer
	if err := r.Write(result, &buf, ""); err != nil {
		t.Fatalf("write empty: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "<?xml") {
		t.Error("output should contain XML declaration")
	}
}

func TestJUnit_NetworkError_UsesErrorElement(t *testing.T) {
	r := &JUnitReporter{}
	result := makeResult("API", []runner.RequestResult{
		{Name: "Unreachable", Method: "GET", URL: "https://gone.example.com",
			Status: 0, Passed: false, Duration: 5000},
	})
	var buf bytes.Buffer
	r.Write(result, &buf, "")

	var suite JUnitTestSuite
	xml.Unmarshal(buf.Bytes()[len(xml.Header):], &suite)

	if suite.TestCases[0].Error == nil {
		t.Error("unreachable host (no error string) should produce <error> element")
	}
}

// ==================== JSON ====================

func TestJSON_AllPassed(t *testing.T) {
	r := &JSONReporter{}
	result := makeResult("MyAPI", allPassed)
	var buf bytes.Buffer
	if err := r.Write(result, &buf, ""); err != nil {
		t.Fatalf("write: %v", err)
	}

	var out JSONResult
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("parse JSON: %v\noutput: %s", err, buf.String())
	}
	if out.CollectionName != "MyAPI" {
		t.Errorf("collection_name: want 'MyAPI', got %q", out.CollectionName)
	}
	if out.Total != 2 {
		t.Errorf("total: want 2, got %d", out.Total)
	}
	if out.Passed != 2 {
		t.Errorf("passed: want 2, got %d", out.Passed)
	}
	if out.Failed != 0 {
		t.Errorf("failed: want 0, got %d", out.Failed)
	}
	if len(out.Requests) != 2 {
		t.Errorf("requests: want 2, got %d", len(out.Requests))
	}
}

func TestJSON_WithFailure(t *testing.T) {
	r := &JSONReporter{}
	result := makeResult("MyAPI", withFailure)
	var buf bytes.Buffer
	r.Write(result, &buf, "")

	var out JSONResult
	json.Unmarshal(buf.Bytes(), &out)

	if out.Failed != 1 {
		t.Errorf("failed: want 1, got %d", out.Failed)
	}
	var failedReq *JSONRequestResult
	for i := range out.Requests {
		if !out.Requests[i].Passed {
			failedReq = &out.Requests[i]
			break
		}
	}
	if failedReq == nil {
		t.Fatal("no failed request in output")
	}
	if failedReq.Error == "" {
		t.Error("failed request should have non-empty error field")
	}
}

func TestJSON_DurationMs(t *testing.T) {
	r := &JSONReporter{}
	result := makeResult("API", []runner.RequestResult{
		{Name: "Fast", Method: "GET", URL: "https://example.com", Status: 200, Passed: true, Duration: 123},
	})
	var buf bytes.Buffer
	r.Write(result, &buf, "")

	var out JSONResult
	json.Unmarshal(buf.Bytes(), &out)
	if out.Requests[0].Duration != 123 {
		t.Errorf("request duration_ms: want 123, got %d", out.Requests[0].Duration)
	}
}

func TestJSON_EmptyResult(t *testing.T) {
	r := &JSONReporter{}
	result := makeResult("Empty", []runner.RequestResult{})
	var buf bytes.Buffer
	if err := r.Write(result, &buf, ""); err != nil {
		t.Fatalf("write empty: %v", err)
	}

	var out JSONResult
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if out.Total != 0 {
		t.Errorf("want total=0, got %d", out.Total)
	}
}

// ==================== Console ====================

func TestConsole_ContainsCollectionName(t *testing.T) {
	r := &ConsoleReporter{NoColor: true}
	result := makeResult("My Collection", allPassed)
	var buf bytes.Buffer
	r.Write(result, &buf, "")
	if !strings.Contains(buf.String(), "My Collection") {
		t.Errorf("output should contain collection name\n%s", buf.String())
	}
}

func TestConsole_PassedCount(t *testing.T) {
	r := &ConsoleReporter{NoColor: true}
	result := makeResult("API", allPassed)
	var buf bytes.Buffer
	r.Write(result, &buf, "")
	out := buf.String()
	if !strings.Contains(out, "2 passed") {
		t.Errorf("output should show '2 passed'\n%s", out)
	}
	if !strings.Contains(out, "0 failed") {
		t.Errorf("output should show '0 failed'\n%s", out)
	}
}

func TestConsole_FailedRequest(t *testing.T) {
	r := &ConsoleReporter{NoColor: true}
	result := makeResult("API", withFailure)
	var buf bytes.Buffer
	r.Write(result, &buf, "")
	out := buf.String()
	if !strings.Contains(out, "1 failed") {
		t.Errorf("output should show '1 failed'\n%s", out)
	}
	if !strings.Contains(out, "expected 2xx, got 404") {
		t.Errorf("output should contain error message\n%s", out)
	}
}

func TestConsole_EmptyResult(t *testing.T) {
	r := &ConsoleReporter{NoColor: true}
	result := makeResult("Empty", []runner.RequestResult{})
	var buf bytes.Buffer
	if err := r.Write(result, &buf, ""); err != nil {
		t.Fatalf("write empty: %v", err)
	}
	if buf.Len() == 0 {
		t.Error("console output should not be empty")
	}
}

// ==================== formatDuration ====================

func TestFormatDuration(t *testing.T) {
	cases := []struct {
		ms   int64
		want string
	}{
		{0, "0ms"},
		{999, "999ms"},
		{1000, "1.0s"},
		{1500, "1.5s"},
		{60000, "1m0s"},
	}
	for _, tc := range cases {
		got := formatDuration(tc.ms)
		if got != tc.want {
			t.Errorf("formatDuration(%d) = %q, want %q", tc.ms, got, tc.want)
		}
	}
}
