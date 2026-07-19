// GoPost CLI — single-binary collection runner and file watcher for CI/CD.
//
// Usage:
//
//	gopost run [flags] <collection|.http-file>
//	gopost watch [flags] <http-file>
//	gopost --version
//
// When invoked without subcommands, prints usage information.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"gopost/app/pkg/runner"
	"gopost/app/pkg/runner/reporters"
)

var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "Print version and exit")

	runCmd := flag.NewFlagSet("run", flag.ExitOnError)
	runCollection := runCmd.String("collection", "", "Collection id/slug/name, collection directory, or .http file")
	runDataDir := runCmd.String("data-dir", "", "Workspace root (default: GOPOST_DATA_DIR, saved workspace, or ~/.gopost)")
	runEnv := runCmd.String("env", "", "Environment name or id under <data-dir>/environments/")
	runEnvFile := runCmd.String("env-file", "", "Path to an environment .gopost.json / .json file")
	runReporter := runCmd.String("reporter", "console", "Reporter: console, junit, json")
	runOutput := runCmd.String("output", "", "Output file path (default: stdout)")
	runParallel := runCmd.Int("parallel", 1, "Number of parallel workers")
	runTimeout := runCmd.Duration("timeout", 30*time.Second, "Per-request timeout")
	runStopOnFail := runCmd.Bool("stop-on-fail", false, "Stop on first failure")

	watchCmd := flag.NewFlagSet("watch", flag.ExitOnError)
	watchInterval := watchCmd.Duration("interval", 2*time.Second, "Poll interval for file changes")
	watchRunOnStart := watchCmd.Bool("run-on-start", true, "Run requests immediately on start")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `GoPost CLI — API collection runner and .http file watcher.

Usage:
  gopost run [flags] <path>           Run a collection or .http file
  gopost watch [flags] <path>         Watch a .http file and run on changes
  gopost --version                    Print version

Run Flags:
  --data-dir PATH      Workspace root (collections/, environments/)
  --env NAME           Environment name/id under <data-dir>/environments/
  --env-file PATH      Load environment from a specific file
  --reporter TYPE      Reporter: console (default), junit, json
  --output PATH        Write report to file (default: stdout)
  --parallel N         Number of parallel workers (default: 1)
  --timeout DURATION   Per-request timeout (default: 30s)
  --stop-on-fail       Stop execution on first failure

Watch Flags:
  --interval DURATION  Poll interval (default: 2s)
  --run-on-start       Run all requests when watching starts (default: true)

Examples:
  gopost run --data-dir . --env ci --reporter junit --output results.xml checkout-api
  gopost run --data-dir . ./collections/checkout-api
  gopost run --env-file ./ci.secret.gopost.json ./api.http
  gopost watch ./api.http
`)
	}

	flag.Parse()

	if *showVersion {
		fmt.Printf("gopost %s\n", version)
		os.Exit(0)
	}

	args := flag.Args()
	if len(args) == 0 {
		fmt.Println("gopost: CLI collection runner — use 'gopost run' or 'gopost watch'")
		fmt.Println("\nUsage: gopost run [flags] <path>   or   gopost watch [flags] <path>")
		fmt.Println("Run 'gopost --help' for more details.")
		os.Exit(0)
	}

	subcommand := args[0]
	remainingArgs := args[1:]

	switch subcommand {
	case "run":
		runCmd.Parse(remainingArgs)
		collectionPath := *runCollection
		if collectionPath == "" && runCmd.NArg() > 0 {
			collectionPath = runCmd.Arg(0)
		}
		if collectionPath == "" {
			fmt.Fprintln(os.Stderr, "Error: collection path or .http file required")
			fmt.Fprintln(os.Stderr, "Usage: gopost run [flags] <collection|.http-file>")
			os.Exit(1)
		}
		handleRun(collectionPath, runDataDir, runEnv, runEnvFile, runReporter, runOutput, runParallel, runTimeout, runStopOnFail)

	case "watch":
		watchCmd.Parse(remainingArgs)
		filePath := watchCmd.Arg(0)
		if filePath == "" {
			fmt.Fprintln(os.Stderr, "Error: .http file path required")
			fmt.Fprintln(os.Stderr, "Usage: gopost watch <path-to-file.http> [flags]")
			os.Exit(1)
		}
		handleWatch(filePath, watchInterval, watchRunOnStart)

	case "help", "-h", "--help":
		flag.Usage()
		os.Exit(0)

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", subcommand)
		flag.Usage()
		os.Exit(1)
	}
}

func handleRun(
	collectionPath string,
	dataDir, envName, envFile, reporterName, outputPath *string,
	parallel *int, timeout *time.Duration, stopOnFail *bool,
) {
	cfg := runner.Config{
		CollectionPath: collectionPath,
		DataDir:        *dataDir,
		Parallel:       *parallel,
		Timeout:        *timeout,
		StopOnFail:     *stopOnFail,
		Reporter:       *reporterName,
		Output:         *outputPath,
	}

	resolvedDir, err := runner.ResolveDataDir(*dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: resolve data dir: %v\n", err)
		os.Exit(1)
	}
	cfg.DataDir = resolvedDir

	switch {
	case *envFile != "":
		env, err := runner.LoadEnvironmentFile(*envFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to load --env-file: %v\n", err)
			os.Exit(1)
		}
		cfg.Environment = env
	case *envName != "":
		env, err := runner.LoadEnvironmentByName(resolvedDir, *envName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to load environment %q: %v\n", *envName, err)
		} else {
			cfg.Environment = env
		}
	}

	result, err := runner.Run(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	var w io.Writer = os.Stdout
	if *outputPath != "" {
		f, err := os.Create(*outputPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to create output file: %v\n", err)
			os.Exit(1)
		}
		defer f.Close()
		w = f
	}

	writeReport(result, *reporterName, *outputPath, w)
	os.Exit(result.ExitCode())
}

func handleWatch(filePath string, interval *time.Duration, runOnStart *bool) {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Error: file not found: %s\n", absPath)
		os.Exit(1)
	}

	if filepath.Ext(absPath) != ".http" {
		fmt.Fprintf(os.Stderr, "Warning: %s does not have .http extension, but will watch anyway\n", absPath)
	}

	fmt.Printf("GoPost watcher — watching %s (poll every %s)\n", absPath, interval)
	fmt.Println("Edit the .http file in VS Code (or any editor) and save to re-run.")
	fmt.Println("Press Ctrl+C to stop.")
	fmt.Println()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	if *runOnStart {
		runHTTPFileAndPrint(absPath, "console")
	}

	lastMod := lastModTime(absPath)
	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			currentMod := lastModTime(absPath)
			if currentMod.After(lastMod) {
				lastMod = currentMod
				fmt.Println("\n── File changed, re-running... ──")
				runHTTPFileAndPrint(absPath, "console")
			}
		case <-stop:
			fmt.Println("\nWatcher stopped.")
			return
		}
	}
}

func runHTTPFileAndPrint(path string, reporterName string) {
	cfg := runner.Config{
		CollectionPath: path,
		Reporter:       reporterName,
		Timeout:        30 * time.Second,
	}
	result, err := runner.Run(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return
	}
	writeReport(result, reporterName, "", os.Stdout)
}

func writeReport(result *runner.Result, reporterName string, outputPath string, w io.Writer) {
	switch reporterName {
	case "junit":
		var rep reporters.JUnitReporter
		rep.Write(result, w, outputPath)
	case "json":
		var rep reporters.JSONReporter
		rep.Write(result, w, outputPath)
	default:
		var rep reporters.ConsoleReporter
		rep.Write(result, w, outputPath)
	}
}

func lastModTime(path string) time.Time {
	fi, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return fi.ModTime()
}
