/**
 * Prow API Client
 */

import axios, { type AxiosInstance } from 'axios';
import type { ProwJob, ProwJobsResponse, ProwConfig } from './types.js';

export class ProwClient {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;

  constructor(config: ProwConfig) {
    this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Fetch all ProwJobs from the /prowjobs.js endpoint
   */
  async getAllProwJobs(): Promise<ProwJob[]> {
    try {
      const response = await this.client.get<ProwJobsResponse>('/prowjobs.js');
      return response.data.items || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch Prow jobs: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get unique job names
   */
  async getJobNames(limit?: number): Promise<string[]> {
    const jobs = await this.getAllProwJobs();
    const uniqueNames = [...new Set(jobs.map(job => job.spec.job))];
    return limit ? uniqueNames.slice(0, limit) : uniqueNames;
  }

  /**
   * Get runs for a specific job
   */
  async getJobRuns(jobName: string, options?: { limit?: number; state?: string }): Promise<ProwJob[]> {
    const allJobs = await this.getAllProwJobs();

    let filtered = allJobs.filter(job => job.spec.job === jobName);

    if (options?.state) {
      filtered = filtered.filter(job => job.status.state === options.state);
    }

    // Sort by creation time (newest first)
    filtered.sort((a, b) => {
      const timeA = a.metadata.creationTimestamp || '';
      const timeB = b.metadata.creationTimestamp || '';
      return timeB.localeCompare(timeA);
    });

    return options?.limit ? filtered.slice(0, options.limit) : filtered;
  }

  /**
   * Get details for a specific job run
   */
  async getJobDetails(jobName: string, buildId?: string): Promise<ProwJob | null> {
    const jobs = await this.getJobRuns(jobName, { limit: buildId ? undefined : 1 });

    if (buildId) {
      return jobs.find(job => job.status.build_id === buildId) || null;
    }

    return jobs[0] || null;
  }

  /**
   * Fetch logs for a job run
   * Note: This attempts to fetch from the job's URL
   */
  async getJobLogs(job: ProwJob): Promise<string> {
    if (!job.status.url) {
      throw new Error('No URL available for this job');
    }

    try {
      // Try to fetch the build log
      const logUrl = `${job.status.url}/build-log.txt`;
      const response = await axios.get<string>(logUrl, {
        timeout: 30000,
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch logs: ${error.message}. URL: ${job.status.url}`);
      }
      throw error;
    }
  }

  /**
   * Analyze failure patterns for a job
   */
  async analyzeFailures(jobName: string, options?: { limit?: number; days?: number }) {
    const limit = options?.limit || 50;
    const jobs = await this.getJobRuns(jobName, { limit, state: 'failure' });

    const patterns = new Map<string, { count: number; examples: string[] }>();
    let totalRuns = 0;
    let failedRuns = jobs.length;

    // If we need to calculate success rate, we need all recent runs
    if (options?.days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.days);
      const allRecentJobs = await this.getJobRuns(jobName);
      totalRuns = allRecentJobs.filter(job => {
        const createdAt = new Date(job.metadata.creationTimestamp || '');
        return createdAt >= cutoffDate;
      }).length;
    }

    // Extract failure patterns from descriptions and build IDs
    for (const job of jobs) {
      const errorKey = job.status.description || job.status.state || 'Unknown error';

      if (!patterns.has(errorKey)) {
        patterns.set(errorKey, { count: 0, examples: [] });
      }

      const pattern = patterns.get(errorKey)!;
      pattern.count++;

      if (pattern.examples.length < 3) {
        pattern.examples.push(job.status.build_id || job.metadata.name);
      }
    }

    return {
      jobName,
      totalRuns: totalRuns || failedRuns,
      failedRuns,
      patterns: Array.from(patterns.entries()).map(([message, data]) => ({
        errorMessage: message,
        count: data.count,
        percentage: (data.count / failedRuns) * 100,
        examples: data.examples,
      })).sort((a, b) => b.count - a.count),
    };
  }
}
