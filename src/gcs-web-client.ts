/**
 * Client for parsing Prow job history web pages
 * More reliable than direct API for recent runs
 */

import axios from 'axios';

export interface JobHistoryRun {
  spyglassLink: string;
  id: string;
  started: string;
  duration: number;
  result: string;
  refs: unknown;
}

// Internal interface matching the actual JSON structure from the page
interface RawJobHistoryRun {
  SpyglassLink: string;
  ID: string;
  Started: string;
  Duration: number;
  Result: string;
  Refs: unknown;
}

export class GCSWebClient {
  private readonly baseUrl = 'https://prow.ci.openshift.org/job-history';

  /**
   * Fetch job history by parsing the job history page
   * This extracts the embedded JavaScript array with complete run data
   *
   * @param jobName - Name of the Prow job
   * @param maxResults - Maximum number of results to return (default: 20)
   * @returns Array of job history runs with metadata
   */
  async getJobHistory(jobName: string, maxResults: number = 20): Promise<JobHistoryRun[]> {
    const url = `${this.baseUrl}/gs/test-platform-results/logs/${jobName}`;

    try {
      const response = await axios.get(url, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'prow-mcp/0.2.0',
        },
      });

      const html = response.data as string;

      // Extract: var allBuilds = [...];
      // The regex needs to handle multi-line JSON arrays
      const match = /var allBuilds = (\[[\s\S]*?\]);/m.exec(html);

      if (!match || !match[1]) {
        throw new Error('Could not parse job history page - allBuilds variable not found');
      }

      // Parse the JSON array (fields are capitalized in the raw JSON)
      let rawBuilds: RawJobHistoryRun[];
      try {
        rawBuilds = JSON.parse(match[1]) as RawJobHistoryRun[];
      } catch (parseError) {
        throw new Error(`Failed to parse allBuilds JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Transform to our expected format (lowercase field names, duration in seconds)
      const builds: JobHistoryRun[] = rawBuilds.map(raw => ({
        spyglassLink: raw.SpyglassLink,
        id: raw.ID,
        started: raw.Started,
        // Duration is in nanoseconds in the raw JSON, convert to seconds
        duration: Math.floor(raw.Duration / 1_000_000_000),
        result: raw.Result,
        refs: raw.Refs,
      }));

      // Return the requested number of results
      return builds.slice(0, maxResults);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(`Failed to fetch job history page: HTTP ${error.response.status} - ${error.response.statusText}`);
        } else if (error.request) {
          throw new Error('Failed to fetch job history page: No response received from server');
        }
      }

      throw new Error(`Failed to fetch job history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the full URL for a job's history page
   *
   * @param jobName - Name of the Prow job
   * @returns Full URL to the job history page
   */
  getJobHistoryUrl(jobName: string): string {
    return `${this.baseUrl}/gs/test-platform-results/logs/${jobName}`;
  }
}
