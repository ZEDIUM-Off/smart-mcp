export type TransportType = "SSE" | "StreamableHTTP";

export interface ConnectionInfo {
  endpointName: string;
  namespaceUuid: string;
  transport: TransportType;
}

export interface LiveConnectionsStats {
  total: number;
  byTransport: {
    SSE: number;
    StreamableHTTP: number;
  };
  byEndpoint: Array<{
    endpointName: string;
    namespaceUuid: string;
    count: number;
    byTransport: {
      SSE: number;
      StreamableHTTP: number;
    };
  }>;
}

export class LiveConnectionsTracker {
  // Singleton instance
  private static instance: LiveConnectionsTracker | null = null;

  // Mapping: sessionId -> ConnectionInfo
  private connections: Map<string, ConnectionInfo> = new Map();

  // Counters by endpoint: endpointName -> namespaceUuid -> count
  private endpointCounts: Map<string, Map<string, number>> = new Map();

  // Counters by transport
  private transportCounts: Map<TransportType, number> = new Map([
    ["SSE", 0],
    ["StreamableHTTP", 0],
  ]);

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): LiveConnectionsTracker {
    if (!LiveConnectionsTracker.instance) {
      LiveConnectionsTracker.instance = new LiveConnectionsTracker();
    }
    return LiveConnectionsTracker.instance;
  }

  /**
   * Add a new connection
   */
  addConnection(
    sessionId: string,
    endpointName: string,
    namespaceUuid: string,
    transport: TransportType,
  ): void {
    // Check if session already exists (idempotent - ignore duplicates)
    if (this.connections.has(sessionId)) {
      console.warn(
        `Connection ${sessionId} already exists, skipping duplicate add`,
      );
      return;
    }

    // Store connection info
    this.connections.set(sessionId, {
      endpointName,
      namespaceUuid,
      transport,
    });

    // Update endpoint counter
    if (!this.endpointCounts.has(endpointName)) {
      this.endpointCounts.set(endpointName, new Map());
    }
    const namespaceMap = this.endpointCounts.get(endpointName)!;
    const currentCount = namespaceMap.get(namespaceUuid) || 0;
    namespaceMap.set(namespaceUuid, currentCount + 1);

    // Update transport counter
    const transportCount = this.transportCounts.get(transport) || 0;
    this.transportCounts.set(transport, transportCount + 1);

    console.log(
      `Added connection: ${sessionId} (${endpointName} -> ${namespaceUuid}, ${transport})`,
    );
  }

  /**
   * Remove a connection
   */
  removeConnection(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      // Idempotent - ignore if already removed
      console.warn(`Connection ${sessionId} not found, skipping remove`);
      return;
    }

    const { endpointName, namespaceUuid, transport } = connection;

    // Remove from connections map
    this.connections.delete(sessionId);

    // Update endpoint counter
    const namespaceMap = this.endpointCounts.get(endpointName);
    if (namespaceMap) {
      const currentCount = namespaceMap.get(namespaceUuid) || 0;
      const newCount = Math.max(0, currentCount - 1);
      if (newCount === 0) {
        namespaceMap.delete(namespaceUuid);
      } else {
        namespaceMap.set(namespaceUuid, newCount);
      }

      // Clean up empty maps
      if (namespaceMap.size === 0) {
        this.endpointCounts.delete(endpointName);
      }
    }

    // Update transport counter
    const transportCount = this.transportCounts.get(transport) || 0;
    this.transportCounts.set(transport, Math.max(0, transportCount - 1));

    console.log(
      `Removed connection: ${sessionId} (${endpointName} -> ${namespaceUuid}, ${transport})`,
    );
  }

  /**
   * Get current statistics
   */
  getStats(): LiveConnectionsStats {
    const byEndpoint: LiveConnectionsStats["byEndpoint"] = [];

    // Build endpoint stats
    for (const [endpointName, namespaceMap] of this.endpointCounts.entries()) {
      for (const [namespaceUuid, count] of namespaceMap.entries()) {
        // Count connections by transport for this endpoint+namespace
        const sseCount = Array.from(this.connections.values()).filter(
          (conn) =>
            conn.endpointName === endpointName &&
            conn.namespaceUuid === namespaceUuid &&
            conn.transport === "SSE",
        ).length;

        const streamableHttpCount = Array.from(
          this.connections.values(),
        ).filter(
          (conn) =>
            conn.endpointName === endpointName &&
            conn.namespaceUuid === namespaceUuid &&
            conn.transport === "StreamableHTTP",
        ).length;

        byEndpoint.push({
          endpointName,
          namespaceUuid,
          count,
          byTransport: {
            SSE: sseCount,
            StreamableHTTP: streamableHttpCount,
          },
        });
      }
    }

    // Sort by count descending
    byEndpoint.sort((a, b) => b.count - a.count);

    return {
      total: this.connections.size,
      byTransport: {
        SSE: this.transportCounts.get("SSE") || 0,
        StreamableHTTP: this.transportCounts.get("StreamableHTTP") || 0,
      },
      byEndpoint,
    };
  }

  /**
   * Get connection info for a specific session
   */
  getConnection(sessionId: string): ConnectionInfo | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Check if a connection exists
   */
  hasConnection(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  /**
   * Get total connection count
   */
  getTotalCount(): number {
    return this.connections.size;
  }

  /**
   * Clear all connections (for testing/cleanup)
   */
  clear(): void {
    this.connections.clear();
    this.endpointCounts.clear();
    this.transportCounts.set("SSE", 0);
    this.transportCounts.set("StreamableHTTP", 0);
  }
}

// Export singleton instance
export const liveConnectionsTracker = LiveConnectionsTracker.getInstance();

