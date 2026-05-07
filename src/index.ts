// ============================================================
// INDEX — Lean MCP server bootstrap
// Imports from focused modules: types, config, tools, handlers
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import PQueue from "p-queue";
import { getKnowledge, setKnowledge, persist, getKnowledgePath } from "./config.js";
import { buildToolList } from "./tools.js";
import { dispatchTool } from "./handlers/index.js";

// ============================================================
// REQUEST QUEUE — Serialize concurrent requests to prevent crashes
// ============================================================

const queue = new PQueue({ concurrency: 1 });

// ============================================================
// SERVER SETUP
// ============================================================

const server = new Server(
  { name: "project-knowledge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================
// LIST TOOLS — Dynamic tool list based on current state
// ============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const kb = getKnowledge();
  const projectNames = Object.keys(kb.projects);
  const featureNames = Object.keys(kb.features);

  return {
    tools: buildToolList(projectNames, featureNames),
  };
});

// ============================================================
// CALL TOOL — Dispatch to the correct handler (serialized via queue)
// ============================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  return queue.add(async () => {
    const handler = dispatchTool(name);

    if (!handler) {
      throw new Error(`Tool "${name}" not found`);
    }

    const result = await handler(getKnowledge(), setKnowledge, persist, getKnowledgePath, args || {});

    // Map our McpResponse to the SDK's CallToolResult
    const response: CallToolResult = {
      content: result.content,
      isError: result.isError,
    };

    return response;
  });
});

// ============================================================
// GRACEFUL SHUTDOWN — Auto-save on exit
// ============================================================

function handleShutdown(signal: string): void {
  console.error(`\nReceived ${signal}. Saving knowledge base...`);
  persist();
  console.error("Knowledge base saved. Goodbye.");
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// ============================================================
// START SERVER
// ============================================================

const transport = new StdioServerTransport();
await server.connect(transport);
