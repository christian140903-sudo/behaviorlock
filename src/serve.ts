import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBehaviorlockServer } from './server.js';

export async function startServer(): Promise<void> {
  const server = createBehaviorlockServer();
  const transport = new StdioServerTransport();
  try { await server.connect(transport); }
  catch (error) { console.error('[behaviorlock] MCP server failed:', error); process.exitCode = 1; }
}
