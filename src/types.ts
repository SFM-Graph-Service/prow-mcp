/**
 * Type definitions for Prow API and MCP tools
 */

// Prow Job Types
export interface ProwJob {
  spec: {
    job: string;
    type: string;
    cluster?: string;
    namespace?: string;
    max_concurrency?: number;
    agent?: string;
    pod_spec?: unknown;
    decoration_config?: unknown;
    refs?: Refs;
    extra_refs?: Refs[];
  };
  status: {
    startTime?: string;
    completionTime?: string;
    state: 'triggered' | 'pending' | 'success' | 'failure' | 'aborted' | 'error';
    description?: string;
    url?: string;
    pod_name?: string;
    build_id?: string;
    prev_report_states?: Record<string, string>;
  };
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
  };
}

export interface Refs {
  org: string;
  repo: string;
  base_ref?: string;
  base_sha?: string;
  pulls?: Pull[];
}

export interface Pull {
  number: number;
  author: string;
  sha: string;
  title?: string;
  ref?: string;
}

export interface ProwJobsResponse {
  items: ProwJob[];
}

// MCP Tool Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

export interface ToolResponse {
  content?: Array<{ type: string; text: string }>;
  error?: string;
  success?: boolean;
}

export type ToolHandler = (params: unknown) => Promise<ToolResponse>;

export interface ProwConfig {
  url: string;
}

// Tool Input Types
export interface ListJobsInput {
  limit?: number;
  state?: string;
}

export interface GetJobRunsInput {
  jobName: string;
  limit?: number;
  state?: string;
}

export interface GetJobDetailsInput {
  jobName: string;
  buildId?: string;
}

export interface GetLogsInput {
  jobName: string;
  buildId: string;
}

export interface AnalyzeFailuresInput {
  jobName: string;
  limit?: number;
  days?: number;
}

// Analysis Results
export interface FailurePattern {
  errorMessage: string;
  count: number;
  percentage: number;
  examples: string[];
}

export interface FailureAnalysis {
  jobName: string;
  totalRuns: number;
  failedRuns: number;
  successRate: number;
  failureRate: number;
  patterns: FailurePattern[];
  timeRange: {
    from: string;
    to: string;
  };
}
