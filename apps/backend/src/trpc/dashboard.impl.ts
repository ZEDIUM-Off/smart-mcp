import { DashboardStatsResponseSchema } from "@repo/zod-types";
import { z } from "zod";

import { mcpServerPool } from "../lib/metamcp/mcp-server-pool";
import { liveConnectionsTracker } from "../lib/metamcp/live-connections-tracker";
import { metaMcpServerPool } from "../lib/metamcp/metamcp-server-pool";

export const dashboardImplementations = {
  getLiveStats: async (
    _userId: string,
  ): Promise<z.infer<typeof DashboardStatsResponseSchema>> => {
    // Get live connections stats
    const liveConnections = liveConnectionsTracker.getStats();

    // Get pool statuses
    const metaMcpPoolStatus = metaMcpServerPool.getPoolStatus();
    const mcpServerPoolStatus = mcpServerPool.getPoolStatus();

    return {
      success: true,
      data: {
        liveConnections: {
          total: liveConnections.total,
          byTransport: {
            SSE: liveConnections.byTransport.SSE,
            StreamableHTTP: liveConnections.byTransport.StreamableHTTP,
          },
          byEndpoint: liveConnections.byEndpoint.map((endpoint) => ({
            endpointName: endpoint.endpointName,
            namespaceUuid: endpoint.namespaceUuid,
            count: endpoint.count,
            byTransport: {
              SSE: endpoint.byTransport.SSE,
              StreamableHTTP: endpoint.byTransport.StreamableHTTP,
            },
          })),
        },
        metaMcpPoolStatus: {
          idle: metaMcpPoolStatus.idle,
          active: metaMcpPoolStatus.active,
          activeSessionIds: metaMcpPoolStatus.activeSessionIds,
          idleNamespaceUuids: metaMcpPoolStatus.idleNamespaceUuids,
        },
        mcpServerPoolStatus: {
          idle: mcpServerPoolStatus.idle,
          active: mcpServerPoolStatus.active,
          activeSessionIds: mcpServerPoolStatus.activeSessionIds,
          idleServerUuids: mcpServerPoolStatus.idleServerUuids,
        },
      },
    };
  },
};

