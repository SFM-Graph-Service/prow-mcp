# Prow MCP Server Usage Guide

## Core Tools

These tools query the Prow API directly (limited to 48-hour window):

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

## Advanced Tools

These tools access GCS bucket for historical data and enhanced functionality:

### 6. `prow_parse_job_history_page` ⭐ NEW

Parse job history page to get 20+ recent runs in one call. **Faster and more reliable** than the API-based approach.

**Example:**
```
Parse job history for "periodic-ci-openshift-release-master-ci-4.14-e2e-aws"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `maxResults` (optional, default: 20): Maximum number of runs to return

**Returns:**
- Job history URL
- Total runs count
- Success/failure statistics and success rate percentage
- Detailed run information:
  - Build ID (needed for fetching logs/artifacts)
  - Result (SUCCESS, FAILURE, etc.)
  - Start timestamp
  - Duration in human-readable format (e.g., "127m 58s")
  - Spyglass URL for detailed view

**Why use this instead of `prow_get_job_runs`?**
- Gets 20+ runs in a single call (vs limited recent runs from API)
- More reliable data source (parses job history page HTML)
- Includes complete run metadata
- Perfect for investigating failure patterns or tracking job health over time

**Example Output:**
```json
{
  "jobName": "periodic-ci-Azure-ARO-HCP-main-periodic-prod-e2e-parallel",
  "source": "Job History Page (embedded JavaScript)",
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
    // ... 19 more runs
  ]
}
```

### 7. `prow_get_historical_runs`
Get unlimited job history from GCS bucket (not limited to 48 hours).

**Example:**
```
Get the last 100 historical runs for "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `limit` (optional, default: 50): Maximum number of historical runs to return

### 8. `prow_get_job_config`
View job configuration from openshift/release repository.

**Example:**
```
Get configuration for job "periodic-ci-Azure-ARO-HCP-main-periodic-prod-e2e-parallel"
```

**Parameters:**
- `jobName` (required): Name of the Prow job

**Returns:**
- Job type (periodic, presubmit, postsubmit)
- Cron schedule and next run time
- Cluster and repository information
- Link to configuration file

### 9. `prow_stream_logs`
Efficiently stream logs with byte-range support. Only download what you need.

**Example:**
```
Get the last 500 lines of logs for build "2051119706227609600" of job "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `buildId` (required): Specific build ID
- `startByte` (optional): Start byte position for partial retrieval
- `endByte` (optional): End byte position for partial retrieval
- `tailLines` (optional): Get last N lines (approximate, ~100 bytes per line)

**Use Cases:**
- `tailLines: 100` - Get last 100 lines for quick failure check
- `startByte: 0, endByte: 10000` - Get first 10KB for early initialization logs
- No params - Get full log (same as prow_get_logs)

### 10. `prow_list_artifacts`
List all artifacts for a specific build.

**Example:**
```
List all artifacts for build "2051119706227609600" of job "my-ci-job-name"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `buildId` (required): Specific build ID

**Returns:**
- List of all files in the build directory
- File sizes and last modified times
- Artifact types (logs, JUnit XML, pod info, etc.)

### 11. `prow_get_artifact`
Fetch a specific artifact from a build.

**Example:**
```
Get the JUnit XML for build "2051119706227609600" of job "my-ci-job-name" at path "artifacts/junit.xml"
```

**Parameters:**
- `jobName` (required): Name of the Prow job
- `buildId` (required): Specific build ID
- `artifactPath` (required): Path to artifact relative to build directory

**Common Artifacts:**
- `prowjob.json` - Full job specification
- `started.json` - Job start metadata
- `finished.json` - Job completion metadata
- `build-log.txt` - Full build log
- `podinfo.json` - Pod information
- `artifacts/junit_*.xml` - JUnit test results

## Example Workflows

### Quick Investigation Workflow (Recommended) 🚀

Use the new job history parser for fast failure analysis:

1. **Discover jobs:**
   ```
   List all prow jobs with limit 20
   ```

2. **Check job health (FAST):**
   ```
   Parse job history for "my-job-name"
   ```
   Returns 20+ runs with success rate in one call!

3. **Identify failing build IDs from the results**
   The output includes all build IDs - pick one with FAILURE result

4. **Get specific failure details:**
   ```
   Get the last 500 lines of logs for build "1234567890" of job "my-job-name"
   ```

### Basic Workflow (Traditional)

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

### Advanced Workflow: Deep Dive Investigation

1. **View job configuration:**
   ```
   Get configuration for job "my-periodic-job"
   ```

2. **Access full history:**
   ```
   Get the last 200 historical runs for "my-periodic-job"
   ```

3. **Narrow to specific failure:**
   ```
   Get details for build "1234567890" of job "my-periodic-job"
   ```

4. **Efficient log analysis:**
   ```
   Get the last 200 lines of logs for build "1234567890"
   ```
   (Only downloads ~20KB instead of full multi-MB log)

5. **Examine test results:**
   ```
   List artifacts for build "1234567890" of job "my-periodic-job"
   ```
   ```
   Get artifact "artifacts/junit_operator.xml" for build "1234567890"
   ```

### Performance Tips

- ⭐ **Use `prow_parse_job_history_page`** for investigating recent runs (fastest way to get 20+ runs)
- **Use `prow_get_historical_runs`** for jobs older than 48 hours or deep historical analysis
- **Use `prow_stream_logs` with `tailLines`** to quickly check failure messages without downloading full logs
- **List artifacts first** before fetching to see what's available
- **Narrow your search** before downloading large logs or artifacts

**Speed Comparison:**
- `prow_parse_job_history_page` (20 runs): **1 HTTP request** (~1-2 seconds)
- `prow_get_job_runs` (20 runs): Multiple API calls, limited data
- `prow_get_historical_runs` (20 runs): 20+ GCS bucket queries (~5-10 seconds)

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

**Using the new fast parser:**
- "Parse job history for periodic-ci-openshift-release-master-ci-4.14-e2e-aws"
- "Show me the last 20 runs of job X with success rate"
- "Get recent history for job Y and tell me when it started failing"
- "Parse job history for Z and identify any consecutive failures"

**Traditional queries:**
- "What are the top 10 most frequently run jobs?"
- "Show me all failed runs from the last 24 hours for job X"
- "What are the most common failure patterns for job Y?"
- "Get the logs for the latest failed run of job Z"
- "What's the success rate of job ABC over the last week?"
