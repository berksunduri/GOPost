package runner

import (
	"testing"

	"gopost/app/pkg/models"
)

// FuzzSubstituteVariables ensures substituteVariables never panics.
func FuzzSubstituteVariables(f *testing.F) {
	f.Add("https://{{host}}/{{path}}", "host", "example.com", "path", "users")
	f.Add("Bearer {{token}}", "token", "abc123", "", "")
	f.Add("{{a}}{{b}}{{c}}", "a", "1", "b", "2")
	f.Add("no placeholders here", "key", "val", "", "")
	f.Add("{{nested {{inner}}}}", "key", "val", "", "")
	f.Add("", "", "", "", "")

	f.Fuzz(func(t *testing.T, s, k1, v1, k2, v2 string) {
		env := &models.Environment{
			Variables: map[string]interface{}{},
		}
		if k1 != "" {
			env.Variables[k1] = v1
		}
		if k2 != "" {
			env.Variables[k2] = v2
		}
		// Must not panic
		result := substituteVariables(s, env)
		_ = result
	})
}

// FuzzSubstituteVariables_NilEnv ensures nil environment is handled.
func FuzzSubstituteVariables_NilEnv(f *testing.F) {
	f.Add("{{host}}/path")
	f.Add("")
	f.Add("no variables")

	f.Fuzz(func(t *testing.T, s string) {
		result := substituteVariables(s, nil)
		_ = result
	})
}
