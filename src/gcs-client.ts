/**
 * GCS Bucket Client for Prow Job Artifacts
 * Provides access to historical job data stored in GCS buckets
 */

import axios, { type AxiosInstance } from 'axios';
import type { ProwJob } from './types.js';

export interface GCSConfig {
  bucketName: string;
  bucketUrl?: string;
}

export interface GCSListResult {
  prefixes: string[];
  objects: GCSObject[];
  nextMarker?: string;
}

export interface GCSObject {
  name: string;
  size: number;
  updated: string;
}

export interface JobMetadata {
  prowJob?: ProwJob;
  started?: {
    timestamp: number;
    [key: string]: unknown;
  };
  finished?: {
    timestamp: number;
    passed: boolean;
    result?: string;
    revision?: string;
    [key: string]: unknown;
  };
}

export class GCSClient {
  private readonly client: AxiosInstance;
  private readonly bucketName: string;
  private readonly baseUrl: string;

  constructor(config: GCSConfig) {
    this.bucketName = config.bucketName;
    this.baseUrl = config.bucketUrl || `https://storage.googleapis.com/${this.bucketName}`;

    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Accept': 'application/json, application/xml, text/plain',
      },
    });
  }

  /**
   * List all build IDs for a specific job using the XML API
   */
  async listJobBuilds(jobName: string, options?: { maxResults?: number; marker?: string }): Promise<{ buildIds: string[]; nextMarker?: string }> {
    const prefix = `logs/${jobName}/`;
    const params = new URLSearchParams({
      prefix,
      delimiter: '/',
    });

    if (options?.maxResults) {
      params.append('max-keys', options.maxResults.toString());
    }

    if (options?.marker) {
      params.append('marker', options.marker);
    }

    try {
      const url = `${this.baseUrl}/?${params.toString()}`;
      const response = await this.client.get(url);

      // Parse XML response
      const buildIds = this.parseCommonPrefixes(response.data, prefix);
      const nextMarker = this.parseNextMarker(response.data);

      return { buildIds, nextMarker };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to list builds for ${jobName}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse CommonPrefixes from GCS XML response to extract build IDs
   */
  private parseCommonPrefixes(xmlData: string, prefix: string): string[] {
    const buildIds: string[] = [];
    const prefixPattern = /<Prefix>([^<]+)<\/Prefix>/g;

    let match;
    while ((match = prefixPattern.exec(xmlData)) !== null) {
      const fullPrefix = match[1];
      // Extract build ID from path like "logs/job-name/1234567890/"
      if (fullPrefix !== prefix && fullPrefix.startsWith(prefix)) {
        const buildId = fullPrefix.slice(prefix.length).replace(/\/$/, '');
        if (buildId) {
          buildIds.push(buildId);
        }
      }
    }

    return buildIds;
  }

  /**
   * Parse NextMarker from GCS XML response for pagination
   */
  private parseNextMarker(xmlData: string): string | undefined {
    const match = /<NextMarker>([^<]+)<\/NextMarker>/.exec(xmlData);
    return match ? match[1] : undefined;
  }

  /**
   * Fetch prowjob.json for a specific build
   */
  async fetchProwJob(jobName: string, buildId: string): Promise<ProwJob> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/prowjob.json`;

    try {
      const response = await this.client.get<ProwJob>(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch prowjob.json for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch started.json for a specific build
   */
  async fetchStarted(jobName: string, buildId: string): Promise<{ timestamp: number; [key: string]: unknown }> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/started.json`;

    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch started.json for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch finished.json for a specific build
   */
  async fetchFinished(jobName: string, buildId: string): Promise<{ timestamp: number; passed: boolean; result?: string; [key: string]: unknown }> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/finished.json`;

    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch finished.json for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch all metadata for a specific build (prowjob, started, finished)
   */
  async fetchBuildMetadata(jobName: string, buildId: string): Promise<JobMetadata> {
    const [prowJob, started, finished] = await Promise.allSettled([
      this.fetchProwJob(jobName, buildId),
      this.fetchStarted(jobName, buildId),
      this.fetchFinished(jobName, buildId),
    ]);

    return {
      prowJob: prowJob.status === 'fulfilled' ? prowJob.value : undefined,
      started: started.status === 'fulfilled' ? started.value : undefined,
      finished: finished.status === 'fulfilled' ? finished.value : undefined,
    };
  }

  /**
   * Get historical job runs with full metadata
   */
  async getHistoricalRuns(jobName: string, limit: number = 50): Promise<ProwJob[]> {
    const { buildIds } = await this.listJobBuilds(jobName, { maxResults: limit * 2 });

    if (buildIds.length === 0) {
      return [];
    }

    // Fetch prowjob.json for each build (limited to requested count)
    const prowJobPromises = buildIds.slice(0, limit).map(buildId =>
      this.fetchProwJob(jobName, buildId).catch(() => null)
    );

    const prowJobs = await Promise.all(prowJobPromises);

    // Filter out failed fetches and sort by creation time (newest first)
    return prowJobs
      .filter((job): job is ProwJob => job !== null)
      .sort((a, b) => {
        const timeA = a.metadata.creationTimestamp || '';
        const timeB = b.metadata.creationTimestamp || '';
        return timeB.localeCompare(timeA);
      });
  }

  /**
   * Stream logs with byte-range support for efficient retrieval
   */
  async streamLogs(jobName: string, buildId: string, options?: { start?: number; end?: number; chunkSize?: number }): Promise<string> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/build-log.txt`;

    try {
      const headers: Record<string, string> = {};

      // Add Range header if start/end specified
      if (options?.start !== undefined || options?.end !== undefined) {
        const start = options.start ?? 0;
        const end = options.end ?? '';
        headers['Range'] = `bytes=${start}-${end}`;
      }

      const response = await this.client.get<string>(url, {
        headers,
        responseType: 'text',
        maxContentLength: options?.chunkSize || 10 * 1024 * 1024, // 10MB default
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch logs for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get log file size without downloading content
   */
  async getLogSize(jobName: string, buildId: string): Promise<number> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/build-log.txt`;

    try {
      const response = await this.client.head(url);
      const contentLength = response.headers['content-length'];
      return contentLength ? parseInt(String(contentLength), 10) : 0;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get log size for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * List artifacts in a build directory
   */
  async listBuildArtifacts(jobName: string, buildId: string): Promise<GCSObject[]> {
    const prefix = `logs/${jobName}/${buildId}/`;
    const params = new URLSearchParams({ prefix });

    try {
      const url = `${this.baseUrl}/?${params.toString()}`;
      const response = await this.client.get(url);

      return this.parseObjects(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to list artifacts for ${buildId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse object list from GCS XML response
   */
  private parseObjects(xmlData: string): GCSObject[] {
    const objects: GCSObject[] = [];
    const contentPattern = /<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<LastModified>([^<]+)<\/LastModified>[\s\S]*?<\/Contents>/g;

    let match;
    while ((match = contentPattern.exec(xmlData)) !== null) {
      objects.push({
        name: match[1],
        size: parseInt(match[2], 10),
        updated: match[3],
      });
    }

    return objects;
  }

  /**
   * Fetch a specific artifact by path
   */
  async fetchArtifact(jobName: string, buildId: string, artifactPath: string): Promise<string> {
    const url = `${this.baseUrl}/logs/${jobName}/${buildId}/${artifactPath}`;

    try {
      const response = await this.client.get<string>(url, {
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch artifact ${artifactPath}: ${error.message}`);
      }
      throw error;
    }
  }
}
