/**
 * MCP Tool Definitions for Prow
 */

import { z } from 'zod';
import type { MCPTool, ToolResponse } from './types.js';
import { ProwClient } from './prow-client.js';
import { GCSClient } from './gcs-client.js';
import { ProwConfigParser } from './config-parser.js';

let prowClient: ProwClient | null = null;
let gcsClient: GCSClient | null = null;
let configParser: ProwConfigParser | null = null;

export function initializeProwClient(url: string): void {
  prowClient = new ProwClient({ url });

  // Initialize GCS client for test-platform-results bucket
  gcsClient = new GCSClient({
    bucketName: 'test-platform-results',
  });

  // Initialize config parser
  configParser = new ProwConfigParser();
}

function getProwClient(): ProwClient {
  if (!prowClient) {
    throw new Error('Prow client not initialized. Set PROW_URL environment variable.');
  }
  return prowClient;
}

function getGCSClient(): GCSClient {
  if (!gcsClient) {
    throw new Error('GCS client not initialized.');
  }
  return gcsClient;
}

function getConfigParser(): ProwConfigParser {
  if (!configParser) {
    throw new Error('Config parser not initialized.');
  }
  return configParser;
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

const getHistoricalRunsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  limit: z.number().int().positive().optional().default(50).describe('Maximum number of historical runs to return'),
});

const getJobConfigSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
});

const streamLogsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  buildId: z.string().min(1).describe('Specific build ID'),
  startByte: z.number().int().min(0).optional().describe('Start byte position for partial log retrieval'),
  endByte: z.number().int().min(0).optional().describe('End byte position for partial log retrieval'),
  tailLines: z.number().int().positive().optional().describe('Get last N lines of log (approximate)'),
});

const listArtifactsSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  buildId: z.string().min(1).describe('Specific build ID'),
});

const getArtifactSchema = z.object({
  jobName: z.string().min(1).describe('Name of the Prow job'),
  buildId: z.string().min(1).describe('Specific build ID'),
  artifactPath: z.string().min(1).describe('Path to artifact relative to build directory'),
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

async function getHistoricalRunsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getHistoricalRunsSchema.parse(params);
    const gcs = getGCSClient();

    const runs = await gcs.getHistoricalRuns(input.jobName, input.limit);

    const summary = runs.map(job => ({
      buildId: job.status.build_id,
      state: job.status.state,
      startTime: job.status.startTime,
      completionTime: job.status.completionTime,
      duration: job.status.startTime && job.status.completionTime
        ? `${Math.round((new Date(job.status.completionTime).getTime() - new Date(job.status.startTime).getTime()) / 1000)}s`
        : 'N/A',
      url: job.status.url,
      description: job.status.description,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          jobName: input.jobName,
          totalRuns: summary.length,
          source: 'GCS bucket (historical)',
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

async function getJobConfigHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getJobConfigSchema.parse(params);
    const parser = getConfigParser();

    const result = await parser.findJobConfig(input.jobName);

    if (!result) {
      return {
        content: [{
          type: 'text',
          text: `No configuration found for job: ${input.jobName}\n\nThis may mean:\n- The job is dynamically generated\n- The job name is incorrect\n- The job is not in the openshift/release repository`,
        }],
        success: true,
      };
    }

    let output = `# Job Configuration: ${input.jobName}\n\n`;
    output += `**Type**: ${result.job.type}\n`;
    output += `**Config URL**: ${result.configUrl}\n\n`;

    if (result.job.cron) {
      const schedule = parser.parseCronSchedule(result.job.cron);
      output += `**Schedule**: ${result.job.cron} (${schedule})\n`;

      const nextRun = parser.getNextRunTime(result.job.cron);
      if (nextRun) {
        output += `**Next Run**: ${nextRun.toISOString()}\n`;
      }
    }

    if (result.job.interval) {
      output += `**Interval**: ${result.job.interval}\n`;
    }

    if (result.job.cluster) {
      output += `**Cluster**: ${result.job.cluster}\n`;
    }

    if (result.job.repo) {
      output += `**Repository**: ${result.job.repo.org}/${result.job.repo.repo}\n`;
      if (result.job.repo.baseBranch) {
        output += `**Branch**: ${result.job.repo.baseBranch}\n`;
      }
    }

    return {
      content: [{
        type: 'text',
        text: output,
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

async function streamLogsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = streamLogsSchema.parse(params);
    const gcs = getGCSClient();

    // Get log size first
    const logSize = await gcs.getLogSize(input.jobName, input.buildId);

    let startByte = input.startByte;
    const endByte = input.endByte;

    // Handle tail lines request
    if (input.tailLines && !startByte && !endByte) {
      // Approximate 100 bytes per line
      const estimatedBytes = input.tailLines * 100;
      startByte = Math.max(0, logSize - estimatedBytes);
    }

    const logs = await gcs.streamLogs(input.jobName, input.buildId, {
      start: startByte,
      end: endByte,
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
    });

    let output = `# Logs for Build ${input.buildId}\n\n`;
    output += `**Job**: ${input.jobName}\n`;
    output += `**Total Log Size**: ${(logSize / 1024 / 1024).toFixed(2)} MB\n`;

    if (startByte !== undefined || endByte !== undefined) {
      output += `**Byte Range**: ${startByte || 0} - ${endByte || logSize}\n`;
      output += `**Retrieved**: ${(logs.length / 1024).toFixed(2)} KB\n`;
    }

    output += `\n${'='.repeat(80)}\n\n`;
    output += logs;

    return {
      content: [{
        type: 'text',
        text: output,
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

async function listArtifactsHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = listArtifactsSchema.parse(params);
    const gcs = getGCSClient();

    const artifacts = await gcs.listBuildArtifacts(input.jobName, input.buildId);

    const summary = artifacts.map(artifact => ({
      name: artifact.name.split('/').pop(),
      fullPath: artifact.name,
      size: `${(artifact.size / 1024).toFixed(2)} KB`,
      updated: artifact.updated,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          jobName: input.jobName,
          buildId: input.buildId,
          totalArtifacts: summary.length,
          artifacts: summary,
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

async function getArtifactHandler(params: unknown): Promise<ToolResponse> {
  try {
    const input = getArtifactSchema.parse(params);
    const gcs = getGCSClient();

    const content = await gcs.fetchArtifact(input.jobName, input.buildId, input.artifactPath);

    return {
      content: [{
        type: 'text',
        text: `# Artifact: ${input.artifactPath}\n\n**Job**: ${input.jobName}\n**Build ID**: ${input.buildId}\n\n${'='.repeat(80)}\n\n${content}`,
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
  {
    name: 'prow_get_historical_runs',
    description: 'Get historical job runs from GCS bucket (not limited to 48 hours). Accesses archived job data for comprehensive history.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of historical runs to return (default: 50)',
        },
      },
      required: ['jobName'],
    },
    handler: getHistoricalRunsHandler,
  },
  {
    name: 'prow_get_job_config',
    description: 'Get job configuration from openshift/release repository. Shows cron schedule, job type, cluster, and other config details.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
      },
      required: ['jobName'],
    },
    handler: getJobConfigHandler,
  },
  {
    name: 'prow_stream_logs',
    description: 'Stream logs with efficient byte-range support. Use after narrowing to specific job run. Supports partial retrieval and tail operations.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        buildId: {
          type: 'string',
          description: 'Specific build ID',
        },
        startByte: {
          type: 'number',
          description: 'Start byte position for partial log retrieval',
        },
        endByte: {
          type: 'number',
          description: 'End byte position for partial log retrieval',
        },
        tailLines: {
          type: 'number',
          description: 'Get last N lines of log (approximate, ~100 bytes per line)',
        },
      },
      required: ['jobName', 'buildId'],
    },
    handler: streamLogsHandler,
  },
  {
    name: 'prow_list_artifacts',
    description: 'List all artifacts for a specific build including JUnit XML, pod info, and other test artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        buildId: {
          type: 'string',
          description: 'Specific build ID',
        },
      },
      required: ['jobName', 'buildId'],
    },
    handler: listArtifactsHandler,
  },
  {
    name: 'prow_get_artifact',
    description: 'Fetch a specific artifact from a build (e.g., junit.xml, podinfo.json).',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Prow job',
        },
        buildId: {
          type: 'string',
          description: 'Specific build ID',
        },
        artifactPath: {
          type: 'string',
          description: 'Path to artifact relative to build directory (e.g., "artifacts/junit.xml")',
        },
      },
      required: ['jobName', 'buildId', 'artifactPath'],
    },
    handler: getArtifactHandler,
  },
];
