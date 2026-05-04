# Prow MCP Server Usage Guide

## Available Tools

### 1. `prow_list_jobs`
List all available Prow job names.

**Example:**
```
List all prow jobs
```

**Parameters:**
- `limit` (optional): Maximum number of jobs to return

### 2. `prow_get_job_runs`
Get recent runs for a specific Prow job.

**Example:**
```
Get the last 10 runs for the job "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `limit` (optional, default: 20): Maximum number of runs to return
- `state` (optional): Filter by state (success, failure, pending, etc.)

### 3. `prow_get_job_details`
Get detailed information about a specific job run.

**Example:**
```
Get details for the latest run of job "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `buildId` (optional): Specific build ID (defaults to latest if not provided)

### 4. `prow_get_logs`
Fetch logs for a specific job run.

**Example:**
```
Get logs for the latest run of "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `buildId` (optional): Specific build ID (defaults to latest if not provided)

### 5. `prow_analyze_failures`
Analyze failure patterns for a Prow job.

**Example:**
```
Analyze failures for "my-ci-job-name" from the last 50 runs
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `limit` (optional, default: 50): Number of failed runs to analyze
- `days` (optional): Analyze failures from the last N days

## Example Workflow

1. **Discover jobs:**
   ```
   List all prow jobs with limit 20
   ```

2. **Check job health:**
   ```
   Get the last 30 runs for job "my-job-name"
   ```

3. **Investigate failures:**
   ```
   Analyze failures for "my-job-name" from the last 100 runs
   ```

4. **Get specific failure details:**
   ```
   Get logs for job "my-job-name" with buildId "1234567890"
   ```

## Integration with Claude Desktop

Add this to your Claude Desktop configuration:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

Replace `/absolute/path/to/prow-mcp` with your actual installation path and `https://your-prow-instance.example.com` with your Prow instance URL.

After adding the configuration:
1. Restart Claude Desktop
2. You should see the Prow tools available in the tools menu
3. Start asking questions about your Prow jobs!

## Common Questions You Can Ask Claude

- "What are the top 10 most frequently run jobs?"
- "Show me all failed runs from the last 24 hours for job X"
- "What are the most common failure patterns for job Y?"
- "Get the logs for the latest failed run of job Z"
- "What's the success rate of job ABC over the last week?"
