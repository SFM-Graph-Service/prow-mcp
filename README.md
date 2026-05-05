# Prow MCP Server

A Model Context Protocol (MCP) server that enables AI assistants like Claude to interact with Prow CI/CD systems. Query job runs, analyze failure patterns, fetch logs, and monitor CI health through natural language.

## Features

- 📋 **List Jobs** - Discover all available Prow jobs in your instance
- 📊 **Job History** - Get recent run history with status, timing, and URLs
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

### Usage with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

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
| `prow_get_historical_runs` | Access unlimited job history from GCS bucket |
| `prow_get_job_config` | View job configuration and cron schedules |
| `prow_stream_logs` | Efficiently stream logs with byte-range support and tail |
| `prow_list_artifacts` | List all artifacts for a specific build |
| `prow_get_artifact` | Fetch specific artifacts (JUnit XML, pod info, etc.) |

See [USAGE.md](USAGE.md) for detailed usage examples and common workflows.

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
