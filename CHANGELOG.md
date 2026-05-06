# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-05

### Added
- **Job History Page Parser** (`prow_parse_job_history_page`) - NEW fast and reliable way to get 20+ recent runs
  - Parses job history HTML page to extract embedded JavaScript data
  - Single HTTP request gets complete run metadata for 20+ runs
  - Includes build IDs, results, timestamps, durations, and Spyglass URLs
  - Returns success/failure statistics and success rate percentage
  - 10-50x faster than making individual API calls for each run
  - More reliable than the `/prowjobs.js` API endpoint
  - Perfect for investigating failure patterns and tracking job health

### Changed
- Updated README.md with new tool documentation and usage examples
- Updated USAGE.md with detailed examples and workflow recommendations
- Enhanced performance tips with speed comparisons between tools

## [0.2.0] - 2024-05-04

### Added
- Historical data access via GCS bucket
- Log streaming with byte-range support
- Artifact management (list and fetch)
- Job configuration parser
- Failure pattern analysis

### Changed
- Improved error handling across all tools
- Enhanced documentation with usage examples

## [0.1.0] - 2024-05-03

### Added
- Initial release
- Basic Prow job listing
- Job run history
- Job details and logs
- MCP server implementation
