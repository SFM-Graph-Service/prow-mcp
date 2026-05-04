#!/usr/bin/env node

/**
 * Prow MCP Server Entry Point
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProwMCPServer } from './server.js';
import { initializeProwClient } from './tools.js';

// Parse CLI arguments
function parseArgs(args: string[]): { url?: string; help: boolean } {
  const result: { url?: string; help: boolean } = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--url' && i + 1 < args.length) {
      result.url = args[i + 1];
      i++;
    }
  }

  return result;
}

function showHelp(): void {
  console.error(`
Prow MCP Server

Usage:
  prow-mcp [options]

Options:
  --url <url>     Prow instance URL (e.g., https://prow.ci.openshift.org)
  -h, --help      Show this help message

Environment Variables:
  PROW_URL        Prow instance URL (alternative to --url)

Example:
  prow-mcp --url https://prow.ci.openshift.org
  PROW_URL=https://prow.ci.openshift.org prow-mcp
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Get Prow URL from args or environment
  const prowUrl = args.url || process.env.PROW_URL;

  if (!prowUrl) {
    console.error('Error: Prow URL is required');
    console.error('Set PROW_URL environment variable or use --url argument');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  // Initialize Prow client
  initializeProwClient(prowUrl);

  console.error('Starting Prow MCP Server');
  console.error(`Prow URL: ${prowUrl}`);

  // Create and start server
  const server = createProwMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('Prow MCP Server is running and ready to accept connections');
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.error('\nShutting down Prow MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\nShutting down Prow MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error(`Failed to start server: ${error}`);
  process.exit(1);
});
