/**
 * Prow Job Configuration Parser
 * Parses job configurations from openshift/release repository
 */

import axios from 'axios';

export interface JobConfig {
  name: string;
  cron?: string;
  interval?: string;
  cluster?: string;
  type: 'periodic' | 'presubmit' | 'postsubmit';
  repo?: {
    org: string;
    repo: string;
    baseBranch?: string;
  };
  spec?: {
    containers?: Array<{
      name: string;
      image?: string;
      command?: string[];
      args?: string[];
    }>;
  };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  [key: string]: unknown;
}

export interface JobConfigSearchResult {
  job: JobConfig;
  configUrl: string;
  raw: string;
}

export class ProwConfigParser {
  private readonly releaseRepoUrl = 'https://raw.githubusercontent.com/openshift/release/master';
  private readonly apiUrl = 'https://api.github.com/repos/openshift/release';

  /**
   * Search for a job configuration by name
   * Looks in ci-operator/jobs/ directory structure
   */
  async findJobConfig(jobName: string): Promise<JobConfigSearchResult | null> {
    try {
      // Parse job name to extract org/repo info
      // Format: periodic-ci-{org}-{repo}-{branch}-{variant}
      const parts = jobName.split('-');

      let org: string | undefined;
      let repo: string | undefined;

      if (parts[0] === 'periodic' && parts[1] === 'ci') {
        org = parts[2];
        repo = parts[3];
      } else if (parts[0] === 'pull' && parts[1] === 'ci') {
        org = parts[2];
        repo = parts[3];
      }

      if (!org || !repo) {
        // Try generic search via GitHub API
        return await this.searchJobConfigViaAPI(jobName);
      }

      // Try standard path
      const configPath = `ci-operator/jobs/${org}/${repo}/${org}-${repo}-master-periodics.yaml`;
      const config = await this.fetchAndParseConfig(configPath, jobName);

      if (config) {
        return config;
      }

      // Try alternate paths
      const alternatePaths = [
        `ci-operator/jobs/${org}/${repo}/${org}-${repo}-main-periodics.yaml`,
        `ci-operator/jobs/${org}/${repo}/${org}-${repo}-periodics.yaml`,
        `ci-operator/jobs/${org}/${repo}/${org}-${repo}-presubmits.yaml`,
        `ci-operator/jobs/${org}/${repo}/${org}-${repo}-postsubmits.yaml`,
      ];

      for (const path of alternatePaths) {
        const result = await this.fetchAndParseConfig(path, jobName);
        if (result) {
          return result;
        }
      }

      // Fallback to API search
      return await this.searchJobConfigViaAPI(jobName);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to find job config: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * Fetch and parse a specific config file
   */
  private async fetchAndParseConfig(configPath: string, jobName: string): Promise<JobConfigSearchResult | null> {
    try {
      const url = `${this.releaseRepoUrl}/${configPath}`;
      const response = await axios.get(url, { timeout: 10000 });

      const job = this.parseYamlForJob(response.data, jobName);

      if (job) {
        return {
          job,
          configUrl: `https://github.com/openshift/release/blob/master/${configPath}`,
          raw: response.data,
        };
      }

      return null;
    } catch (_error) {
      // File not found or other error - return null to try other paths
      return null;
    }
  }

  /**
   * Search for job config via GitHub API (code search)
   */
  private async searchJobConfigViaAPI(jobName: string): Promise<JobConfigSearchResult | null> {
    try {
      const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(`"name: ${jobName}" repo:openshift/release path:ci-operator/jobs`)}`;

      const response = await axios.get(searchUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      });

      if (response.data.items && response.data.items.length > 0) {
        const item = response.data.items[0];
        const downloadUrl = item.url.replace('api.github.com/repos', 'raw.githubusercontent.com').replace('/contents/', '/master/');

        const configResponse = await axios.get(downloadUrl, { timeout: 10000 });
        const job = this.parseYamlForJob(configResponse.data, jobName);

        if (job) {
          return {
            job,
            configUrl: item.html_url,
            raw: configResponse.data,
          };
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Simple YAML parser to extract job configuration
   * Note: This is a basic parser - for production use a proper YAML library
   */
  private parseYamlForJob(yamlContent: string, jobName: string): JobConfig | null {
    const lines = yamlContent.split('\n');
    let currentJob: Partial<JobConfig> | null = null;
    let inJob = false;
    let indent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Find job by name
      if (trimmed.startsWith('- name:') || trimmed.startsWith('name:')) {
        const nameMatch = trimmed.match(/name:\s*['"]?([^'"]+)['"]?/);
        if (nameMatch && nameMatch[1] === jobName) {
          inJob = true;
          indent = line.search(/\S/);
          currentJob = { name: jobName };
          continue;
        } else if (inJob && line.search(/\S/) <= indent && trimmed.startsWith('- name:')) {
          // Moved to next job
          break;
        }
      }

      if (!inJob || !currentJob) continue;

      // Stop if we've moved past this job
      if (trimmed && line.search(/\S/) <= indent && (trimmed.startsWith('- ') || trimmed.startsWith('postsubmits:') || trimmed.startsWith('presubmits:') || trimmed.startsWith('periodics:'))) {
        break;
      }

      // Parse fields
      if (trimmed.startsWith('cron:')) {
        const match = trimmed.match(/cron:\s*['"]([^'"]+)['"]/);
        if (match) currentJob.cron = match[1];
      } else if (trimmed.startsWith('interval:')) {
        const match = trimmed.match(/interval:\s*['"]?([^'"]+)['"]?/);
        if (match) currentJob.interval = match[1];
      } else if (trimmed.startsWith('cluster:')) {
        const match = trimmed.match(/cluster:\s*['"]?([^'"]+)['"]?/);
        if (match) currentJob.cluster = match[1];
      }
    }

    if (currentJob && currentJob.name) {
      // Determine job type from content
      if (yamlContent.includes(`periodics:`)) {
        currentJob.type = 'periodic';
      } else if (yamlContent.includes(`presubmits:`)) {
        currentJob.type = 'presubmit';
      } else if (yamlContent.includes(`postsubmits:`)) {
        currentJob.type = 'postsubmit';
      } else {
        currentJob.type = 'periodic'; // default
      }

      return currentJob as JobConfig;
    }

    return null;
  }

  /**
   * Parse cron schedule to human-readable format
   */
  parseCronSchedule(cron: string): string {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) {
      return cron;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Check for common patterns
    if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every hour';
    }

    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
    }

    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayOfWeek === '*' ? 'Every day' : days[parseInt(dayOfWeek)] || `Day ${dayOfWeek}`;
      return `${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
    }

    if (minute.startsWith('*/')) {
      const interval = minute.slice(2);
      return `Every ${interval} minutes`;
    }

    if (hour.startsWith('*/')) {
      const interval = hour.slice(2);
      return `Every ${interval} hours`;
    }

    return cron;
  }

  /**
   * Calculate next run time based on cron schedule
   */
  getNextRunTime(cron: string): Date | null {
    // This is a simplified version - for production use a proper cron parser
    const parts = cron.split(/\s+/);
    if (parts.length < 5) {
      return null;
    }

    const [minute, hour] = parts;

    if (minute === '*' || hour === '*') {
      return new Date(Date.now() + 60000); // Next minute
    }

    const now = new Date();
    const next = new Date(now);

    const targetHour = parseInt(hour, 10);
    const targetMinute = parseInt(minute, 10);

    if (isNaN(targetHour) || isNaN(targetMinute)) {
      return null;
    }

    next.setUTCHours(targetHour, targetMinute, 0, 0);

    // If time has passed today, move to tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    return next;
  }
}
