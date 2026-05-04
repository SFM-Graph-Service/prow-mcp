/**
 * MCP Server Setup
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tools.js';

export function createProwMCPServer(): Server {
  const server = new Server(
    {
      name: 'prow-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    try {
      const result = await tool.handler(args ?? {});

      if (result.success === false) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${result.error}`,
          }],
        };
      }

      return {
        content: result.content ?? [{
          type: 'text',
          text: 'Tool executed successfully',
        }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  return server;
}
