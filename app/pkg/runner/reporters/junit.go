package reporters

import (
	"encoding/xml"
	"fmt"
	"io"

	"gopost/app/pkg/runner"
)

// JUnitTestSuite represents the JUnit XML <testsuite> element.
type JUnitTestSuite struct {
	XMLName   xml.Name        `xml:"testsuite"`
	Name      string          `xml:"name,attr"`
	Tests     int             `xml:"tests,attr"`
	Failures  int             `xml:"failures,attr"`
	Errors    int             `xml:"errors,attr"`
	Time      float64         `xml:"time,attr"`
	Timestamp string          `xml:"timestamp,attr,omitempty"`
	TestCases []JUnitTestCase `xml:"testcase"`
}

// JUnitTestCase represents a <testcase> element.
type JUnitTestCase struct {
	Name      string        `xml:"name,attr"`
	Classname string        `xml:"classname,attr"`
	Time      float64       `xml:"time,attr"`
	Failure   *JUnitFailure `xml:"failure,omitempty"`
	Error     *JUnitError   `xml:"error,omitempty"`
}

// JUnitFailure represents a <failure> element.
type JUnitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Content string `xml:",chardata"`
}

// JUnitError represents an <error> element.
type JUnitError struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Content string `xml:",chardata"`
}

// JUnitReporter writes JUnit XML output compatible with GitHub Actions, GitLab CI, Jenkins.
type JUnitReporter struct{}

func (r *JUnitReporter) Write(result *runner.Result, w io.Writer, _ string) error {
	suite := JUnitTestSuite{
		Name:  result.CollectionName,
		Tests: result.Total,
		Time:  result.Duration.Seconds(),
	}

	for _, req := range result.Requests {
		tc := JUnitTestCase{
			Name:      req.Name,
			Classname: fmt.Sprintf("%s.%s", result.CollectionName, req.Method),
			Time:      float64(req.Duration) / 1000.0,
		}

		if !req.Passed {
			if req.Error != "" {
				tc.Failure = &JUnitFailure{
					Message: req.Error,
					Type:    "HTTPError",
					Content: fmt.Sprintf("Method: %s\nURL: %s\nStatus: %d\nError: %s",
						req.Method, req.URL, req.Status, req.Error),
				}
				suite.Failures++
			} else {
				tc.Error = &JUnitError{
					Message: fmt.Sprintf("Expected %d", req.Status),
					Type:    "AssertionError",
					Content: fmt.Sprintf("Method: %s\nURL: %s\nStatus: %d",
						req.Method, req.URL, req.Status),
				}
				suite.Errors++
			}
		}

		suite.TestCases = append(suite.TestCases, tc)
	}

	output, err := xml.MarshalIndent(suite, "", "  ")
	if err != nil {
		return err
	}
	_, err = w.Write(append([]byte(xml.Header), output...))
	return err
}
