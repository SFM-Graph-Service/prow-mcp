/**
 * MCP Tool Definitions for Prow
 */

import { z } from 'zod';
import type { MCPTool, ToolResponse } from './types.js';
import { ProwClient } from './prow-client.js';

let prowClient: ProwClient | null = null;

export function initializeProwClient(url: string): void {
  prowClient = new ProwClient({ url });
}

function getProwClient(): ProwClient {
  if (!prowClient) {
    throw new Error('Prow client not initialized. Set PROW_URL environment variable.');
  }
  return prowClient;
}

// Input Schemas
const listJobsSchema = z.object({
  limit: z.number().int().positive().optional().describe('Maximum number of jobs to return'),
  state: z.string().optional().describe('Filter by state (success, failure, pending, etc.)'),
});

const getJobRunsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  limit: z.number().int().positive().optional().default(20).describe('Maximum number of runs to return'),
  state: z.string().optional().describe('Filter by state (success, failure, pending, etc.)'),
});

const getJobDetailsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  buildId: z.string().optional().describe('Specific build ID (optional, defaults to latest)'),
});

const getLogsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  buildId: z.string().optional().describe('Specific build ID (optional, defaults to latest)'),
});

const analyzeFailuresSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  limit: z.number().int().positive().optional().default(50).describe('Number of failed runs to analyze'),
  days: z.number().int().positive().optional().describe('Analyze failures from the last N days'),
});

// Tool Handlers
async function listJobsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = listJobsSchema.parse(params);
    const client = getProwClient();

    const jobNames = await client.getJobNames(input.limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalJobs: jobNames.length,
          jobs: jobNames,
        }, null, 2),
      }],
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

async function getJobRunsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getJobRunsSchema.parse(params);
    const client = getProwClient();

    const runs = await client.getJobRuns(input.jobName, {
      limit: input.limit,
      state: input.state,
    });

    const summary = runs.map(job => ({
      buildId: job.status.build_id,
      state: job.status.state,
      startTime: job.status.startTime,
      completionTime: job.status.completionTime,
      url: job.status.url,
      description: job.status.description,
      podName: job.status.pod_name,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          jobName: input.jobName,
          totalRuns: summary.length,
          runs: summary,
        }, null, 2),
      }],
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

async function getJobDetailsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getJobDetailsSchema.parse(params);
    const client = getProwClient();

    const job = await client.getJobDetails(input.jobName, input.buildId);

    if (!job) {
      return {
        error: `No job found for ${input.jobName}${input.buildId ? ` with buildId ${input.buildId}` : ''}`,
        success: false,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          jobName: job.spec.job,
          buildId: job.status.build_id,
          state: job.status.state,
          startTime: job.status.startTime,
          completionTime: job.status.completionTime,
          duration: job.status.startTime && job.status.completionTime
            ? `${Math.round((new Date(job.status.completionTime).getTime() - new Date(job.status.startTime).getTime()) / 1000)}s`
            : 'N/A',
          url: job.status.url,
          description: job.status.description,
          podName: job.status.pod_name,
          type: job.spec.type,
          cluster: job.spec.cluster,
          refs: job.spec.refs,
          labels: job.metadata.labels,
        }, null, 2),
      }],
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

async function getLogsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getLogsSchema.parse(params);
    const client = getProwClient();

    const job = await client.getJobDetails(input.jobName, input.buildId);

    if (!job) {
      return {
        error: `No job found for ${input.jobName}${input.buildId ? ` with buildId ${input.buildId}` : ''}`,
        success: false,
      };
    }

    const logs = await client.getJobLogs(job);

    return {
      content: [{
        type: 'text',
        text: `Job: ${job.spec.job}\nBuild ID: ${job.status.build_id}\nState: ${job.status.state}\nURL: ${job.status.url}\n\n=== LOGS ===\n\n${logs}`,
      }],
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

async function analyzeFailuresHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = analyzeFailuresSchema.parse(params);
    const client = getProwClient();

    const analysis = await client.analyzeFailures(input.jobName, {
      limit: input.limit,
      days: input.days,
    });

    const successRate = ((analysis.totalRuns - analysis.failedRuns) / analysis.totalRuns * 100).toFixed(2);
    const failureRate = (analysis.failedRuns / analysis.totalRuns * 100).toFixed(2);

    let report = `# Failure Analysis: ${analysis.jobName}\n\n`;
    report += `**Total Runs**: ${analysis.totalRuns}\n`;
    report += `**Failed Runs**: ${analysis.failedRuns}\n`;
    report += `**Success Rate**: ${successRate}%\n`;
    report += `**Failure Rate**: ${failureRate}%\n\n`;

    if (analysis.patterns.length > 0) {
      report += `## Failure Patterns\n\n`;

      for (const pattern of analysis.patterns) {
        report += `### ${pattern.errorMessage}\n`;
        report += `- **Occurrences**: ${pattern.count} (${pattern.percentage.toFixed(1)}%)\n`;
        report += `- **Example Build IDs**: ${pattern.examples.join(', ')}\n\n`;
      }
    } else {
      report += `No failure patterns found.\n`;
    }

    return {
      content: [{
        type: 'text',
        text: report,
      }],
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

// Tool Definitions
export const tools: MCPTool[] = [
  {
    name: 'prow_list_jobs',
    description: 'List all Prow job names. Useful for discovering available jobs to analyze.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of jobs to return',
        },
      },
    },
    handler: listJobsHandler,
  },
  {
    name: 'prow_get_job_runs',
    description: 'Get recent runs for a specific Prow job. Returns run history with status, timing, and URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of runs to return (default: 20)',
        },
        state: {
          type: 'string',
          description: 'Filter by state (success, failure, pending, etc.)',
        },
      },
      required: ['jobName'],
    },
    handler: getJobRunsHandler,
  },
  {
    name: 'prow_get_job_details',
    description: 'Get detailed information about a specific job run, including refs, labels, and timing.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        buildId: {
          type: 'string',
          description: 'Specific build ID (optional, defaults to latest)',
        },
      },
      required: ['jobName'],
    },
    handler: getJobDetailsHandler,
  },
  {
    name: 'prow_get_logs',
    description: 'Fetch logs for a specific job run. Retrieves build logs from the job URL.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        buildId: {
          type: 'string',
          description: 'Specific build ID (optional, defaults to latest)',
        },
      },
      required: ['jobName'],
    },
    handler: getLogsHandler,
  },
  {
    name: 'prow_analyze_failures',
    description: 'Analyze failure patterns for a Prow job. Identifies common errors, calculates success rates, and shows failure trends.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        limit: {
          type: 'number',
          description: 'Number of failed runs to analyze (default: 50)',
        },
        days: {
          type: 'number',
          description: 'Analyze failures from the last N days',
        },
      },
      required: ['jobName'],
    },
    handler: analyzeFailuresHandler,
  },
];
