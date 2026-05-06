# Prow MCP Server

A Model Context Protocol (MCP) server that enables AI assistants like Claude to interact with Prow CI/CD systems. Query job runs, analyze failure patterns, fetch logs, and monitor CI health through natural language.

## Features

- 📋 **List Jobs** - Discover all available Prow jobs in your instance
- 📊 **Job History** - Get recent run history with status, timing, and URLs
- 🚀 **Fast History Parser** - Parse job history pages to get 20+ runs in one call (NEW!)
- 🕒 **Historical Data** - Access unlimited job history via GCS bucket (not limited to 48 hours)
- 🔍 **Detailed Info** - View comprehensive job run details including refs, labels, and timing
- 📝 **Efficient Log Streaming** - Fetch logs with byte-range support for large files
- 📈 **Failure Analysis** - Identify common failure patterns and calculate success rates
- ⚙️ **Job Configuration** - Parse and view job configs from openshift/release repository
- 📦 **Artifact Management** - List and retrieve build artifacts (JUnit XML, pod info, etc.)

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Configuration

Configure your Prow instance URL using either:

**Environment Variable:**
```bash
export PROW_URL="https://your-prow-instance.example.com"
```

**CLI Argument:**
```bash
prow-mcp --url https://your-prow-instance.example.com
```

### Usage with Claude Code (CLI)

Add to your MCP configuration file at `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "prow": {
      "command": "node",
      "args": [
        "/absolute/path/to/prow-mcp/dist/index.js",
        "--url",
        "https://your-prow-instance.example.com"
      ]
    }
  }
}
```

**Note**: Replace `/absolute/path/to/prow-mcp` with the actual path to your installation.

After adding the configuration, restart Claude Code or start a new session.

### Usage with Claude Desktop (GUI App)

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

Use the same JSON configuration as shown above for Claude Code.

After adding the configuration, restart Claude Desktop.

### Standalone Usage

```bash
npm start -- --url https://your-prow-instance.example.com
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Build the project
npm run build

# Run tests (if available)
npm test
```

## Available Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `prow_list_jobs` | List all Prow job names with optional filtering |
| `prow_get_job_runs` | Get recent run history (48h window from API) |
| `prow_get_job_details` | Get detailed information about a job run |
| `prow_get_logs` | Fetch build logs for a specific job run |
| `prow_analyze_failures` | Analyze failure patterns and calculate success rates |

### Historical Data & Advanced Tools

| Tool | Description |
|------|-------------|
| `prow_parse_job_history_page` | **NEW** Parse job history page to get 20+ recent runs in one call (faster & more reliable) |
| `prow_get_historical_runs` | Access unlimited job history from GCS bucket |
| `prow_get_job_config` | View job configuration and cron schedules |
| `prow_stream_logs` | Efficiently stream logs with byte-range support and tail |
| `prow_list_artifacts` | List all artifacts for a specific build |
| `prow_get_artifact` | Fetch specific artifacts (JUnit XML, pod info, etc.) |

See [USAGE.md](USAGE.md) for detailed usage examples and common workflows.

## New Feature: Job History Page Parser

The `prow_parse_job_history_page` tool provides a faster and more reliable way to get recent job history compared to the traditional API-based approach.

### Why Use This Tool?

**Traditional Approach** (`prow_get_job_runs`):
- Limited to `/prowjobs.js` API endpoint
- May only return a few recent runs
- Requires multiple API calls for comprehensive history
- Less reliable for historical analysis

**New Approach** (`prow_parse_job_history_page`):
- Parses the job history HTML page directly
- Gets 20+ recent runs in a single call
- Extracts embedded JavaScript data (`var allBuilds = [...]`)
- More reliable and faster for investigations
- Includes complete metadata (build IDs, results, timestamps, durations)

### Usage Example

**Ask Claude:**
```
Parse job history for "periodic-ci-openshift-release-master-ci-4.14-e2e-aws"
```

**Output includes:**
- Total number of runs retrieved
- Success/failure counts and success rate
- Detailed run information:
  - Build ID
  - Result (SUCCESS/FAILURE)
  - Start timestamp
  - Duration (in human-readable format)
  - Spyglass URL for detailed logs

**Sample output:**
```json
{
  "jobName": "periodic-ci-openshift-release-master-ci-4.14-e2e-aws",
  "source": "Job History Page (embedded JavaScript)",
  "historyPageUrl": "https://prow.ci.openshift.org/job-history/gs/test-platform-results/logs/...",
  "totalRuns": 20,
  "summary": {
    "successCount": 16,
    "failureCount": 4,
    "successRate": "80.0%"
  },
  "runs": [
    {
      "buildId": "2051844452745482240",
      "result": "SUCCESS",
      "started": "2026-05-06T02:00:18Z",
      "duration": "127m 58s",
      "spyglassUrl": "/view/gs/test-platform-results/logs/..."
    }
    // ... more runs
  ]
}
```

### When to Use Each Tool

| Scenario | Recommended Tool |
|----------|-----------------|
| Quick check of recent runs (last few) | `prow_get_job_runs` |
| Investigating failure patterns (need 10-20 runs) | `prow_parse_job_history_page` ⭐ |
| Deep historical analysis (30+ days old) | `prow_get_historical_runs` |
| Need full job details with refs/labels | `prow_get_job_details` |

## Compatible Prow Instances

This MCP server works with any Prow instance that exposes the standard `/prowjobs.js` endpoint, including:

- Kubernetes Prow
- OpenShift CI
- Tekton-based Prow instances
- Custom Prow deployments

## Requirements

- Node.js 20.0.0 or higher
- Access to a Prow instance with `/prowjobs.js` endpoint

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see [LICENSE](LICENSE) file for details.
