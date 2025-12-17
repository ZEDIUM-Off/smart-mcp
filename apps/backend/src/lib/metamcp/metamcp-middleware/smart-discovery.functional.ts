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
import { namespacesTable } from "../../../db/schema";
import { discoveryService } from "../../discovery";
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

function buildFindToolDescription(tools: Tool[], namespaceDescription?: string | null): string {
  const lines: string[] = [];

  lines.push(
    "Smart Discovery is enabled for this namespace.",
    "Use metamcp__find to discover the right tools for a task. It searches semantically across tool names + descriptions.",
    'Provide a natural-language query like: "take a screenshot", "fetch a url", "query postgres", "read files".',
    "",
  );

  if (namespaceDescription && namespaceDescription.trim()) {
    lines.push("Namespace hint:", namespaceDescription.trim(), "");
  }

  const filtered = (tools || []).filter((t) => t?.name && t.name !== "metamcp__find");
  if (filtered.length === 0) {
    lines.push("No tools are currently available to index in this namespace.");
    return lines.join("\n");
  }

  // Group by server prefix when available (serverName__toolName)
  const groups = new Map<string, Tool[]>();
  for (const tool of filtered) {
    const idx = tool.name.indexOf("__");
    const server = idx === -1 ? "unknown" : tool.name.slice(0, idx);
    const arr = groups.get(server) ?? [];
    arr.push(tool);
    groups.set(server, arr);
  }

  lines.push(`Registry overview: ${filtered.length} tool(s) across ${groups.size} server(s).`, "");

  // Stable output: sort servers + tools
  const serverNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  for (const serverName of serverNames) {
    const serverTools = (groups.get(serverName) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`Server: ${serverName} (${serverTools.length} tool(s))`);
    for (const tool of serverTools) {
      const idx = tool.name.indexOf("__");
      const shortName = idx === -1 ? tool.name : tool.name.slice(idx + 2);
      const desc = (tool.description || "").trim();
      lines.push(`- ${shortName}: ${desc || "No description."}`);
    }
    lines.push("");
  }

  // Guard against pathological sizes while still being "as full as possible"
  const text = lines.join("\n");
  const MAX_CHARS = 24000;
  if (text.length > MAX_CHARS) {
    return (
      text.slice(0, MAX_CHARS) +
      `\n\n[Truncated: description exceeded ${MAX_CHARS} characters. Refine by using metamcp__find queries to discover specific tools.]`
    );
  }
  return text;
}

/**
 * The synthetic "find" tool exposed when smart discovery is enabled
 */
const getFindTool = (description?: string | null): Tool => ({
  name: "metamcp__find",
  description: description || `Search for available tools by describing what you want to do.
Returns matching tool definitions that you can then call directly.

Example queries:
- "read and write files"
- "search the web"
- "run shell commands"
- "manage git repositories"
- "analyze data"

Returns a JSON array of matching tools with their names, descriptions, and input schemas.
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
      // We use the connection ID as the session ID
      const sessionId = context.connectionId || "default";
      const discoveredToolNames = sessionManager.getDiscoveredToolNames(sessionId, context.namespaceUuid);
      
      const discoveredTools = response.tools.filter(tool => discoveredToolNames.has(tool.name));

      // 3. Return the synthetic "find" tool + any discovered tools
      const findDescription = buildFindToolDescription(response.tools || [], status.description);
      return {
        ...response,
        tools: [getFindTool(findDescription), ...discoveredTools],
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

      // Check if this is a call to the "find" tool
      if (toolName !== "metamcp__find") {
        // Not a find tool call - pass through to next handler
        return handler(request, context);
      }

      // This is a call to the "find" tool
      // Check if smart discovery is enabled
      const status = await getSmartDiscoveryStatus(context.namespaceUuid, useCache);

      if (!status.enabled) {
        // Smart discovery not enabled but someone tried to call "find"
        // This shouldn't happen normally, but handle gracefully
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Smart Discovery is not enabled for this namespace",
                message: "The 'find' tool is only available when Smart Discovery mode is enabled.",
              }),
            },
          ],
          isError: true,
        };
      }

      // Extract query from arguments
      const args = request.params.arguments as { query?: string; limit?: number } | undefined;
      const query = args?.query;
      const limit = Math.min(args?.limit ?? 5, 20); // Cap at 20

      if (!query || typeof query !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Missing required parameter: query",
                message: "Please provide a 'query' parameter describing what tools you're looking for.",
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
          limit
        );

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: "No tools found matching your query",
                  query: query,
                  suggestion: "Try a different search term or be more specific about what you want to accomplish.",
                }),
              },
            ],
          };
        }

        // Add found tools to session
        const sessionId = context.connectionId || "default";
        const foundToolNames = results.map(r => r.tool.name);
        sessionManager.setTools(sessionId, context.namespaceUuid, foundToolNames);

        // Format results as tool definitions
        const toolDefinitions = results.map((result) => ({
          name: result.tool.name,
          description: result.tool.description,
          relevanceScore: Math.round(result.score * 100) / 100,
          utilityHint: result.tool.description || "",
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: `Found ${results.length} tool(s) matching your query`,
                query: query,
                tools: toolDefinitions,
                usage: "These tools have been added to your session. You can now call them directly.",
              }, null, 2),
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
                message: error instanceof Error ? error.message : "Unknown error occurred",
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
