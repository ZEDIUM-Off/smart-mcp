/**
 * Discovery Service
 *
 * Provides semantic tool discovery using vector embeddings.
 * Indexes tools by their name and description, then allows
 * similarity search using natural language queries.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { embeddingProvider } from "./embedding-provider";

/**
 * Cached tool entry with embedding
 */
interface ToolIndexEntry {
  toolName: string;
  fullToolName: string; // serverName__toolName format
  serverName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  embedding: number[];
  hash: string; // Hash to detect changes
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  tool: Tool;
  serverName: string;
  score: number;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Simple hash function for change detection
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export class DiscoveryService {
  // Cache: Map<namespaceUuid, Map<toolKey, ToolIndexEntry>>
  private cache: Map<string, Map<string, ToolIndexEntry>> = new Map();

  // Pending indexing operations to prevent duplicates
  private pendingIndexing: Map<string, Promise<void>> = new Map();

  constructor() {}

  /**
   * Generate a unique key for a tool
   */
  private getToolKey(fullToolName: string): string {
    return fullToolName;
  }

  /**
   * Generate hash for change detection
   */
  private getToolHash(tool: Tool): string {
    return simpleHash(`${tool.name}:${tool.title || ""}:${tool.description || ""}`);
  }

  /**
   * Parse tool name to extract server name and original tool name
   * Format: serverName__toolName
   */
  private parseToolName(
    fullName: string
  ): { serverName: string; originalName: string } | null {
    const separatorIndex = fullName.indexOf("__");
    if (separatorIndex === -1) {
      return null;
    }
    return {
      serverName: fullName.substring(0, separatorIndex),
      originalName: fullName.substring(separatorIndex + 2),
    };
  }

  /**
   * Index a single tool, generating its embedding
   */
  private async indexTool(
    namespaceUuid: string,
    tool: Tool
  ): Promise<void> {
    const namespaceCache = this.cache.get(namespaceUuid);
    if (!namespaceCache) return;

    const toolKey = this.getToolKey(tool.name);
    const newHash = this.getToolHash(tool);

    // Check if already cached with same hash
    const existing = namespaceCache.get(toolKey);
    if (existing && existing.hash === newHash) {
      return;
    }

    // Parse tool name
    const parsed = this.parseToolName(tool.name);
    const serverName = parsed?.serverName || "unknown";
    const originalName = parsed?.originalName || tool.name;

    // Generate semantic text for embedding
    const titlePart = tool.title ? ` Title: ${tool.title}.` : "";
    const descPart = tool.description ? tool.description : "No description";
    const textToEmbed = `Server: ${serverName}. Tool: ${originalName}.${titlePart} Description: ${descPart}`;

    try {
      const embedding = await embeddingProvider.generateEmbedding(textToEmbed);

      namespaceCache.set(toolKey, {
        toolName: originalName,
        fullToolName: tool.name,
        serverName,
        description: tool.description || "",
        inputSchema: tool.inputSchema as Record<string, unknown>,
        embedding,
        hash: newHash,
      });
    } catch (error) {
      console.error(`[Discovery] Failed to embed tool ${tool.name}:`, error);
    }
  }

  /**
   * Index a list of tools for a namespace.
   * Uses caching to skip unchanged tools.
   * Non-blocking - returns immediately and indexes in background.
   */
  public async indexTools(namespaceUuid: string, tools: Tool[]): Promise<void> {
    // Initialize namespace cache if needed
    if (!this.cache.has(namespaceUuid)) {
      this.cache.set(namespaceUuid, new Map());
    }

    // Check if already indexing this namespace
    const pendingKey = namespaceUuid;
    if (this.pendingIndexing.has(pendingKey)) {
      return this.pendingIndexing.get(pendingKey);
    }

    const indexingPromise = (async () => {
      const startTime = Date.now();
      let indexed = 0;

      // Index tools in parallel with concurrency limit
      const batchSize = 5;
      for (let i = 0; i < tools.length; i += batchSize) {
        const batch = tools.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (tool) => {
            const namespaceCache = this.cache.get(namespaceUuid)!;
            const toolKey = this.getToolKey(tool.name);
            const newHash = this.getToolHash(tool);
            const existing = namespaceCache.get(toolKey);

            if (!existing || existing.hash !== newHash) {
              await this.indexTool(namespaceUuid, tool);
              indexed++;
            }
          })
        );
      }

      const elapsed = Date.now() - startTime;
      if (indexed > 0) {
        console.log(
          `[Discovery] Indexed ${indexed}/${tools.length} tools for namespace ${namespaceUuid} in ${elapsed}ms`
        );
      }
    })();

    this.pendingIndexing.set(pendingKey, indexingPromise);

    try {
      await indexingPromise;
    } finally {
      this.pendingIndexing.delete(pendingKey);
    }
  }

  /**
   * Search for tools matching a query using semantic similarity.
   */
  public async search(
    namespaceUuid: string,
    query: string,
    limit: number = 5,
    threshold: number = 0.3
  ): Promise<SearchResult[]> {
    const namespaceCache = this.cache.get(namespaceUuid);
    if (!namespaceCache || namespaceCache.size === 0) {
      console.log(`[Discovery] No tools indexed for namespace ${namespaceUuid}`);
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await embeddingProvider.generateEmbedding(query);

    // Calculate similarity for all indexed tools
    const results: SearchResult[] = [];

    for (const [, entry] of namespaceCache) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);

      if (score >= threshold) {
        results.push({
          tool: {
            name: entry.fullToolName,
            description: entry.description,
            inputSchema: entry.inputSchema,
          },
          serverName: entry.serverName,
          score,
        });
      }
    }

    // Sort by score descending and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get all indexed tools for a namespace (for debugging)
   */
  public getIndexedTools(namespaceUuid: string): string[] {
    const namespaceCache = this.cache.get(namespaceUuid);
    if (!namespaceCache) return [];
    return Array.from(namespaceCache.keys());
  }

  /**
   * Clear cache for a namespace
   */
  public clearNamespaceCache(namespaceUuid: string): void {
    this.cache.delete(namespaceUuid);
    console.log(`[Discovery] Cleared cache for namespace ${namespaceUuid}`);
  }

  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.cache.clear();
    console.log("[Discovery] Cleared all caches");
  }

  /**
   * Get cache statistics
   */
  public getStats(): { namespaces: number; tools: number } {
    let totalTools = 0;
    for (const cache of this.cache.values()) {
      totalTools += cache.size;
    }
    return {
      namespaces: this.cache.size,
      tools: totalTools,
    };
  }
}

// Export singleton instance
export const discoveryService = new DiscoveryService();
