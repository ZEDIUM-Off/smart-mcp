/**
 * Smart Discovery Middleware
 *
 * When smart_discovery_enabled is true for a namespace:
 * - tools/list returns a synthetic "find" tool AND any tools previously discovered in the current session
 * - tools/call on "find" performs semantic search and returns tool definitions
 * - Discovered tools are added to the session state so they can be called directly
 *
 * This reduces token usage by hiding tools until the LLM
 * explicitly searches for them with a natural language query.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";

import { db } from "../../../db/index";
import { namespaceAgentsRepository } from "../../../db/repositories";
import { namespacesTable } from "../../../db/schema";
import { discoveryService } from "../../discovery";
import {
  AskAgent,
  DiscoveryToolSearch,
  OpenAiLlmAdapter,
} from "../../ask-agent";
import { namespaceAgentDocumentsRepository } from "../../../db/repositories";
import {
  type CallToolHandler,
  CallToolMiddleware,
  type ListToolsHandler,
  ListToolsMiddleware,
  MetaMCPHandlerContext,
} from "./functional-middleware";

/**
 * Configuration for smart discovery middleware
 */
export interface SmartDiscoveryConfig {
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

interface SmartDiscoveryStatus {
  enabled: boolean;
  description?: string | null;
}

/**
 * Cache for namespace smart discovery status
 */
class SmartDiscoveryStatusCache {
  private cache = new Map<string, SmartDiscoveryStatus>();
  private expiry = new Map<string, number>();
  private ttl: number;

  constructor(ttl: number = 5000) {
    this.ttl = ttl;
  }

  get(namespaceUuid: string): SmartDiscoveryStatus | null {
    const expiry = this.expiry.get(namespaceUuid);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(namespaceUuid);
      this.expiry.delete(namespaceUuid);
      return null;
    }
    return this.cache.get(namespaceUuid) ?? null;
  }

  set(namespaceUuid: string, status: SmartDiscoveryStatus): void {
    this.cache.set(namespaceUuid, status);
    this.expiry.set(namespaceUuid, Date.now() + this.ttl);
  }

  clear(namespaceUuid?: string): void {
    if (namespaceUuid) {
      this.cache.delete(namespaceUuid);
      this.expiry.delete(namespaceUuid);
    } else {
      this.cache.clear();
      this.expiry.clear();
    }
  }
}

// Global cache instance
const smartDiscoveryStatusCache = new SmartDiscoveryStatusCache();

/**
 * Session manager for discovered tools
 * Maps sessionId -> Set of tool names that have been discovered
 */
class DiscoveredToolsSessionManager {
  // Map<sessionId, Map<namespaceUuid, Set<toolName>>>
  private sessions = new Map<string, Map<string, Set<string>>>();
  
  // Clean up old sessions periodically (simple implementation)
  private lastCleanup = Date.now();
  private CLEANUP_INTERVAL = 1000 * 60 * 60; // 1 hour

  addTools(sessionId: string, namespaceUuid: string, toolNames: string[]) {
    this.cleanupIfNeeded();
    
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    
    const sessionNamespaces = this.sessions.get(sessionId)!;
    if (!sessionNamespaces.has(namespaceUuid)) {
      sessionNamespaces.set(namespaceUuid, new Set());
    }
    
    const discoveredSet = sessionNamespaces.get(namespaceUuid)!;
    toolNames.forEach(name => discoveredSet.add(name));
  }

  /**
   * Replace the discovered tools set for a session+namespace.
   * This makes tools/list reflect ONLY the most recent find result.
   */
  setTools(sessionId: string, namespaceUuid: string, toolNames: string[]) {
    this.cleanupIfNeeded();
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    const sessionNamespaces = this.sessions.get(sessionId)!;
    sessionNamespaces.set(namespaceUuid, new Set(toolNames));
  }

  getDiscoveredToolNames(sessionId: string, namespaceUuid: string): Set<string> {
    const sessionNamespaces = this.sessions.get(sessionId);
    if (!sessionNamespaces) return new Set();
    
    return sessionNamespaces.get(namespaceUuid) || new Set();
  }

  private cleanupIfNeeded() {
    const now = Date.now();
    if (now - this.lastCleanup > this.CLEANUP_INTERVAL) {
      // In a real app, we'd track last access time per session
      // For now, we'll just clear everything to prevent memory leaks
      // This is acceptable for a dev tool / prototype
      if (this.sessions.size > 1000) {
        this.sessions.clear();
      }
      this.lastCleanup = now;
    }
  }
}

const sessionManager = new DiscoveredToolsSessionManager();

function getServerOverview(tools: Tool[]): {
  totalTools: number;
  servers: Array<{ server: string; count: number }>;
} {
  const filtered = (tools || []).filter(
    (t) =>
      t?.name &&
      t.name !== "metamcp__find" &&
      t.name !== "metamcp__ask",
  );

  const groups = new Map<string, number>();
  for (const tool of filtered) {
    const idx = tool.name.indexOf("__");
    const server = idx === -1 ? "unknown" : tool.name.slice(0, idx);
    groups.set(server, (groups.get(server) ?? 0) + 1);
  }

  const servers = Array.from(groups.entries())
    .map(([server, count]) => ({ server, count }))
    .sort((a, b) => a.server.localeCompare(b.server));

  return { totalTools: filtered.length, servers };
}

function buildAskToolDescription(
  tools: Tool[],
  namespaceDescription?: string | null,
): string {
  const overview = getServerOverview(tools);

  const lines: string[] = [];
  lines.push(
    "## Smart Discovery: Ask Agent",
    "",
    "Use `metamcp__ask` to get a fast, actionable report for this namespace. The agent can (optionally) execute allowed tools and then recommend / expose the most useful tools for follow-up calls.",
    "",
    `**Registry overview:** ${overview.totalTools} tool(s) across ${overview.servers.length} server(s).`,
    "",
    "### How to Use",
    "",
    "Call `metamcp__ask` with a natural-language `query` describing your goal. You may optionally limit tool execution with `maxToolCalls`.",
    "",
    "### Servers (high-level)",
    "",
  );

  if (overview.servers.length === 0) {
    lines.push("- (no servers available)");
  } else {
    for (const s of overview.servers) {
      lines.push(`- \`${s.server}\` (${s.count} tool(s))`);
    }
  }
  lines.push("");

  if (namespaceDescription && namespaceDescription.trim()) {
    lines.push("### Namespace Context", "", namespaceDescription.trim(), "");
  }

  lines.push(
    "### Examples",
    "",
    "```",
    'metamcp__ask({ query: "What can I do in this namespace?" })',
    'metamcp__ask({ query: "Find the best tool(s) to take a screenshot", maxToolCalls: 0 })',
    'metamcp__ask({ query: "Debug why my build fails", maxToolCalls: 2 })',
    "```",
    "",
    "### What You Will Get Back",
    "",
    "A JSON report with:",
    "- `answer`: The agent's answer",
    "- `toolCallsExecuted`: Tools it executed (if any) + short outputs",
    "- `suggestedTools`: Tools to use next (with example calls / params)",
    "- `exposedTools`: Tools added to your session (they will appear in `tools/list` afterwards)",
    "- `followups`: Clarifying questions / next steps",
  );

  return lines.join("\n");
}

function buildFindToolDescription(
  tools: Tool[],
  namespaceDescription?: string | null,
): string {
  const overview = getServerOverview(tools);
  const lines: string[] = [];

  lines.push(
    "## Smart Discovery: Find Tool",
    "",
    "Use `metamcp__find` to discover the right tools for a task without loading the full tool registry into context.",
    "",
    `**Registry overview:** ${overview.totalTools} tool(s) across ${overview.servers.length} server(s).`,
    "",
    "### How to Use",
    "",
    "Call `metamcp__find` with a natural-language `query` describing what you want to accomplish. Optionally set `limit` (default 5, max 20).",
    "",
    "### Servers (high-level)",
    "",
  );

  if (overview.servers.length === 0) {
    lines.push("- (no servers available)");
  } else {
    for (const s of overview.servers) {
      lines.push(`- \`${s.server}\` (${s.count} tool(s))`);
    }
  }
  lines.push("");

  if (namespaceDescription && namespaceDescription.trim()) {
    lines.push("### Namespace Context", "", namespaceDescription.trim(), "");
  }

  lines.push(
    "### Examples",
    "",
    "```",
    'metamcp__find({ query: "take a screenshot" })',
    'metamcp__find({ query: "fetch a url", limit: 10 })',
    'metamcp__find({ query: "read and write files" })',
    "```",
    "",
    "### What You Will Get Back",
    "",
    "A JSON object with:",
    "- `message`: Summary",
    "- `query`: Your original query",
    "- `tools`: Matching tool definitions (name/description/input schema + relevanceScore)",
    "",
    "The returned tools are added to your session, so you can call them directly by name afterwards.",
  );

  return lines.join("\n");
}

/**
 * The synthetic "find" tool exposed when smart discovery is enabled
 */
const getFindTool = (description?: string | null): Tool => ({
  name: "metamcp__find",
  description: description || `## Smart Discovery Tool

Search for available tools by describing what you want to do. Returns matching tool definitions that you can then call directly.

### How to Use

Call this tool with a \`query\` parameter describing your task in natural language.

### Examples

\`\`\`
metamcp__find({ query: "read and write files" })
metamcp__find({ query: "search the web" })
metamcp__find({ query: "run shell commands" })
metamcp__find({ query: "manage git repositories" })
metamcp__find({ query: "analyze data" })
\`\`\`

### What You Will Get Back

Returns a JSON object with:
- \`message\`: Summary message
- \`query\`: Your original query
- \`tools\`: Array of matching tool definitions, each with:
  - \`name\`: Full tool name (e.g., \`ServerName__toolName\`)
  - \`description\`: Tool description
  - \`arguments\`: Tool's input schema (JSON Schema)
  - \`relevanceScore\`: Semantic relevance score (0-1)

After receiving the results, you can call any of the returned tools directly by name.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language description of what you want to accomplish",
      },
      limit: {
        type: "number",
        description: "Maximum number of tools to return (default: 5, max: 20)",
        default: 5,
      },
    },
    required: ["query"],
  },
});

const getAskTool = (description?: string | null): Tool => ({
  name: "metamcp__ask",
  description:
    description ||
    `## Smart Discovery: Ask Agent

Use \`metamcp__ask\` to get a report, recommendations, and (optionally) execute tools to answer faster.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language question or task request for this namespace",
      },
      maxToolCalls: {
        type: "number",
        description:
          "Maximum number of tool calls the agent may execute (overrides agent config, default: config value)",
      },
      exposeLimit: {
        type: "number",
        description:
          "Maximum number of tools to expose in-session after answering (overrides agent config, default: config value)",
      },
    },
    required: ["query"],
  },
});

/**
 * Check if smart discovery is enabled for a namespace
 */
async function getSmartDiscoveryStatus(
  namespaceUuid: string,
  useCache: boolean = true
): Promise<SmartDiscoveryStatus> {
  // Check cache first
  if (useCache) {
    const cached = smartDiscoveryStatusCache.get(namespaceUuid);
    if (cached !== null) {
      return cached;
    }
  }

  try {
    const [namespace] = await db
      .select({ 
        smart_discovery_enabled: namespacesTable.smart_discovery_enabled,
        smart_discovery_description: namespacesTable.smart_discovery_description
      })
      .from(namespacesTable)
      .where(eq(namespacesTable.uuid, namespaceUuid));

    const status: SmartDiscoveryStatus = {
      enabled: namespace?.smart_discovery_enabled ?? false,
      description: namespace?.smart_discovery_description
    };

    if (useCache) {
      smartDiscoveryStatusCache.set(namespaceUuid, status);
    }

    return status;
  } catch (error) {
    console.error(
      `[SmartDiscovery] Error checking smart_discovery_enabled for namespace ${namespaceUuid}:`,
      error
    );
    return { enabled: false };
  }
}

/**
 * Get pinned tools for a namespace
 */
async function getPinnedTools(
  namespaceUuid: string
): Promise<string[]> {
  try {
    const [namespace] = await db
      .select({ 
        smart_discovery_pinned_tools: namespacesTable.smart_discovery_pinned_tools
      })
      .from(namespacesTable)
      .where(eq(namespacesTable.uuid, namespaceUuid));

    // IMPORTANT: Drizzle's .$type<string[]>() is compile-time only.
    // The DB value can be corrupted or manually modified, so we must validate at runtime.
    const raw = namespace?.smart_discovery_pinned_tools as unknown;
    if (!Array.isArray(raw)) return [];
    // Filter to strings only; ignore invalid entries defensively.
    return raw.filter((v): v is string => typeof v === "string");
  } catch (error) {
    console.error(
      `[SmartDiscovery] Error fetching pinned tools for namespace ${namespaceUuid}:`,
      error
    );
    return [];
  }
}

/**
 * Creates a List Tools middleware that replaces the tool list
 * with just the "find" tool when smart discovery is enabled.
 *
 * IMPORTANT: This middleware also captures the real tools for indexing,
 * so it must be placed FIRST in the middleware chain to see all tools.
 */
export function createSmartDiscoveryListToolsMiddleware(
  config: SmartDiscoveryConfig = {}
): ListToolsMiddleware {
  const useCache = config.cacheEnabled ?? true;

  return (handler: ListToolsHandler): ListToolsHandler => {
    return async (request, context: MetaMCPHandlerContext) => {
      // First, get the actual tools from the next handler
      const response = await handler(request, context);

      // Check if smart discovery is enabled for this namespace
      const status = await getSmartDiscoveryStatus(context.namespaceUuid, useCache);

      if (!status.enabled) {
        // Smart discovery disabled - return all tools as normal
        return response;
      }

      // Smart discovery is enabled
      // 1. Index the real tools in the background (non-blocking)
      if (response.tools && response.tools.length > 0) {
        // Don't await - let it run in background
        discoveryService.indexTools(context.namespaceUuid, response.tools).catch((error) => {
          console.error(
            `[SmartDiscovery] Error indexing tools for namespace ${context.namespaceUuid}:`,
            error
          );
        });
      }

      // 2. Get discovered tools for this session
      const discoveredToolNames = sessionManager.getDiscoveredToolNames(context.sessionId, context.namespaceUuid);
      const discoveredTools = response.tools.filter(tool => discoveredToolNames.has(tool.name));

      // 3. Get pinned tools
      const pinnedToolNames = await getPinnedTools(context.namespaceUuid);
      const pinnedToolsSet = new Set(pinnedToolNames);
      const pinnedTools = response.tools.filter(tool => pinnedToolsSet.has(tool.name));

      // 4. Combine all tools: find tool + pinned tools + discovered tools (avoid duplicates)
      const allToolNames = new Set<string>();
      const finalTools: Tool[] = [];
      
      // Add ask + find tools first
      const findDescription = buildFindToolDescription(response.tools || [], status.description);
      const askDescription = buildAskToolDescription(response.tools || [], status.description);
      finalTools.push(getAskTool(askDescription));
      allToolNames.add("metamcp__ask");
      finalTools.push(getFindTool(findDescription));
      allToolNames.add("metamcp__find");

      // Add pinned tools
      for (const tool of pinnedTools) {
        if (!allToolNames.has(tool.name)) {
          finalTools.push(tool);
          allToolNames.add(tool.name);
        }
      }

      // Add discovered tools
      for (const tool of discoveredTools) {
        if (!allToolNames.has(tool.name)) {
          finalTools.push(tool);
          allToolNames.add(tool.name);
        }
      }

      return {
        ...response,
        tools: finalTools,
      };
    };
  };
}

/**
 * Creates a Call Tool middleware that handles the "find" tool
 * using semantic search when smart discovery is enabled.
 */
export function createSmartDiscoveryCallToolMiddleware(
  config: SmartDiscoveryConfig = {}
): CallToolMiddleware {
  const useCache = config.cacheEnabled ?? true;

  return (handler: CallToolHandler): CallToolHandler => {
    return async (request, context: MetaMCPHandlerContext) => {
      const toolName = request.params.name;

      // Intercept smart discovery synthetic tools
      if (toolName !== "metamcp__find" && toolName !== "metamcp__ask") {
        // Not a find tool call - pass through to next handler
        return handler(request, context);
      }

      // This is a call to a synthetic smart discovery tool
      // Check if smart discovery is enabled
      const status = await getSmartDiscoveryStatus(context.namespaceUuid, useCache);

      if (!status.enabled) {
        // Smart discovery not enabled but someone tried to call a synthetic tool
        // This shouldn't happen normally, but handle gracefully
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Smart Discovery is not enabled for this namespace",
                message:
                  "Smart Discovery synthetic tools are only available when Smart Discovery mode is enabled.",
              }),
            },
          ],
          isError: true,
        };
      }

      // Handle "find"
      if (toolName === "metamcp__find") {
        // Extract query from arguments
        const args = request.params.arguments as
          | { query?: string; limit?: number }
          | undefined;
        const query = args?.query;
        const limit = Math.min(args?.limit ?? 5, 20); // Cap at 20

        if (!query || typeof query !== "string") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Missing required parameter: query",
                  message:
                    "Please provide a 'query' parameter describing what tools you're looking for.",
                }),
              },
            ],
            isError: true,
          };
        }

        try {
          // Perform semantic search
          const results = await discoveryService.search(
            context.namespaceUuid,
            query,
            limit,
          );

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    message: "No tools found matching your query",
                    query: query,
                    suggestion:
                      "Try a different search term or be more specific about what you want to accomplish.",
                  }),
                },
              ],
            };
          }

          // Add found tools to session
          const foundToolNames = results.map((r) => r.tool.name);
          sessionManager.setTools(
            context.sessionId,
            context.namespaceUuid,
            foundToolNames,
          );

          // Format results as tool definitions
          const toolDefinitions = results.map((result) => ({
            name: result.tool.name,
            description: result.tool.description,
            relevanceScore: Math.round(result.score * 100) / 100,
            arguments: result.tool.inputSchema || {},
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message: `Found ${results.length} tool(s) matching your query`,
                    query: query,
                    tools: toolDefinitions,
                    usage:
                      "These tools have been added to your session. You can now call them directly.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error(`[SmartDiscovery] Error searching tools:`, error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to search for tools",
                  message:
                    error instanceof Error ? error.message : "Unknown error occurred",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      // Handle "ask"
      const args = request.params.arguments as
        | { query?: string; maxToolCalls?: number; exposeLimit?: number }
        | undefined;
      const query = args?.query;
      if (!query || typeof query !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Missing required parameter: query",
                message:
                  "Please provide a 'query' parameter describing what you want to achieve.",
              }),
            },
          ],
          isError: true,
        };
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "OPENAI_API_KEY is not configured",
                message:
                  "Set OPENAI_API_KEY to enable metamcp__ask orchestration.",
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Pick active agent for this namespace (fallback: create a default one)
        const [ns] =
          (await db
            .select({
              ask_agent_uuid: namespacesTable.ask_agent_uuid,
            })
            .from(namespacesTable)
            .where(eq(namespacesTable.uuid, context.namespaceUuid))
            .limit(1)) ?? [];

        let agent =
          ns?.ask_agent_uuid
            ? await namespaceAgentsRepository.getByUuid(ns.ask_agent_uuid)
            : null;

        if (!agent) {
          agent =
            (await namespaceAgentsRepository.getFirstByNamespaceAndType(
              context.namespaceUuid,
              "ask",
            )) ??
            (await namespaceAgentsRepository.create({
              namespace_uuid: context.namespaceUuid,
              name: "Default Ask Agent",
              agent_type: "ask",
            }));
        }

        const docs = await namespaceAgentDocumentsRepository.listByAgent(agent.uuid);
        const ragDocs = docs.map((d) => ({
          uuid: d.uuid,
          filename: d.filename,
          mime: d.mime,
          content: d.content,
        }));

        const askAgent = new AskAgent({
          llm: new OpenAiLlmAdapter({ apiKey }),
          search: new DiscoveryToolSearch(),
          exec: {
            callTool: async (fullToolName, toolArgs) => {
              const res = await handler(
                {
                  ...request,
                  params: {
                    ...request.params,
                    name: fullToolName,
                    arguments: toolArgs,
                  },
                },
                context,
              );
              return res.content;
            },
          },
          expose: {
            setExposedTools: (sessionId, namespaceUuid, toolNames) => {
              sessionManager.setTools(sessionId, namespaceUuid, toolNames);
            },
          },
        });

        const result = await askAgent.run(
          {
            namespaceUuid: context.namespaceUuid,
            sessionId: context.sessionId,
            namespaceDescription: status.description,
          },
          {
            enabled: (agent?.enabled as boolean) ?? true,
            model: (agent?.model as string) || "gpt-4o-mini",
            systemPrompt:
              (agent?.system_prompt as string) ||
              "You are a specialized assistant for a tool namespace. Be concise, safe, and actionable.",
            references: {
              ...(((agent?.references as Record<string, unknown>) ?? {}) as Record<
                string,
                unknown
              >),
              ragDocuments: ragDocs,
            },
            allowedTools: (agent?.allowed_tools as string[]) ?? [],
            deniedTools: (agent?.denied_tools as string[]) ?? [],
            maxToolCalls: (agent?.max_tool_calls as number) ?? 3,
            exposeLimit: (agent?.expose_limit as number) ?? 5,
          },
          {
            query,
            maxToolCalls:
              typeof args?.maxToolCalls === "number"
                ? args.maxToolCalls
                : ((agent?.max_tool_calls as number) ?? 3),
            exposeLimit:
              typeof args?.exposeLimit === "number"
                ? args.exposeLimit
                : ((agent?.expose_limit as number) ?? 5),
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  answer: result.answer,
                  toolCallsExecuted: result.toolCallsExecuted,
                  suggestedTools: result.suggestedTools ?? [],
                  exposedTools: result.exposedTools,
                  followups: result.followups,
                  usage: result.usage,
                  tokenUsage: result.tokenUsage,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        console.error(`[SmartDiscovery] Error running ask agent:`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to run ask agent",
                message:
                  error instanceof Error ? error.message : "Unknown error occurred",
              }),
            },
          ],
          isError: true,
        };
      }
    };
  };
}

/**
 * Clear smart discovery cache for a namespace
 */
export function clearSmartDiscoveryCache(namespaceUuid?: string): void {
  smartDiscoveryStatusCache.clear(namespaceUuid);
  if (namespaceUuid) {
    discoveryService.clearNamespaceCache(namespaceUuid);
  } else {
    discoveryService.clearAllCaches();
  }
}
