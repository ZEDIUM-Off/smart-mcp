import { z } from "zod";

// Live connections stats schema
export const LiveConnectionsByTransportSchema = z.object({
  SSE: z.number().int().min(0),
  StreamableHTTP: z.number().int().min(0),
});

export const LiveConnectionsByEndpointSchema = z.object({
  endpointName: z.string(),
  namespaceUuid: z.string().uuid(),
  count: z.number().int().min(0),
  byTransport: LiveConnectionsByTransportSchema,
});

export const LiveConnectionsStatsSchema = z.object({
  total: z.number().int().min(0),
  byTransport: LiveConnectionsByTransportSchema,
  byEndpoint: z.array(LiveConnectionsByEndpointSchema),
});

// Pool status schemas
export const MetaMcpServerPoolStatusSchema = z.object({
  idle: z.number().int().min(0),
  active: z.number().int().min(0),
  activeSessionIds: z.array(z.string()),
  idleNamespaceUuids: z.array(z.string().uuid()),
});

export const McpServerPoolStatusSchema = z.object({
  idle: z.number().int().min(0),
  active: z.number().int().min(0),
  activeSessionIds: z.array(z.string()),
  idleServerUuids: z.array(z.string().uuid()),
});

// Dashboard stats response schema
export const DashboardStatsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    liveConnections: LiveConnectionsStatsSchema,
    metaMcpPoolStatus: MetaMcpServerPoolStatusSchema,
    mcpServerPoolStatus: McpServerPoolStatusSchema,
  }),
});

// Type exports
export type LiveConnectionsByTransport = z.infer<
  typeof LiveConnectionsByTransportSchema
>;
export type LiveConnectionsByEndpoint = z.infer<
  typeof LiveConnectionsByEndpointSchema
>;
export type LiveConnectionsStats = z.infer<typeof LiveConnectionsStatsSchema>;
export type MetaMcpServerPoolStatus = z.infer<
  typeof MetaMcpServerPoolStatusSchema
>;
export type McpServerPoolStatus = z.infer<typeof McpServerPoolStatusSchema>;
export type DashboardStatsResponse = z.infer<
  typeof DashboardStatsResponseSchema
>;

