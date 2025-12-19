import { z } from "zod";

import {
  McpServerErrorStatusEnum,
  McpServerSchema,
  McpServerStatusEnum,
} from "./mcp-servers.zod";
import { ToolSchema, ToolStatusEnum } from "./tools.zod";

const ToolAnnotationsSchema = z.record(z.unknown());

// Namespace schema definitions
export const createNamespaceFormSchema = z.object({
  name: z.string().min(1, "validation:namespaceName.required"),
  description: z.string().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smartDiscoveryEnabled: z.boolean().optional().default(false),
  smartDiscoveryDescription: z.string().optional(),
});

export type CreateNamespaceFormData = z.infer<typeof createNamespaceFormSchema>;

export const editNamespaceFormSchema = z.object({
  name: z.string().min(1, "validation:namespaceName.required"),
  description: z.string().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smartDiscoveryEnabled: z.boolean().optional(),
  smartDiscoveryDescription: z.string().optional(),
});

export type EditNamespaceFormData = z.infer<typeof editNamespaceFormSchema>;

export const CreateNamespaceRequestSchema = z.object({
  name: z.string().min(1, "validation:namespaceName.required"),
  description: z.string().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smartDiscoveryEnabled: z.boolean().optional().default(false),
  smartDiscoveryDescription: z.string().optional(),
});

export const NamespaceSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  user_id: z.string().nullable(),
  smart_discovery_enabled: z.boolean(),
  smart_discovery_description: z.string().nullable().optional(),
  smart_discovery_pinned_tools: z.array(z.string()).optional().default([]),
  ask_agent_uuid: z.string().uuid().nullable().optional(),
});

// Server within namespace schema - extends McpServerSchema with namespace-specific status
export const NamespaceServerSchema = McpServerSchema.extend({
  status: McpServerStatusEnum,
  error_status: McpServerErrorStatusEnum.optional(),
});

// Tool within namespace schema - extends ToolSchema with namespace-specific status and server info
export const NamespaceToolSchema = ToolSchema.extend({
  serverName: z.string(),
  serverUuid: z.string(),
  status: ToolStatusEnum, // Status from namespace tool mapping
  overrideName: z.string().nullable().optional(),
  overrideTitle: z.string().nullable().optional(),
  overrideDescription: z.string().nullable().optional(),
  overrideAnnotations: ToolAnnotationsSchema.nullable().optional(),
});

export const NamespaceWithServersSchema = NamespaceSchema.extend({
  servers: z.array(NamespaceServerSchema),
});

export const CreateNamespaceResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceSchema.optional(),
  message: z.string().optional(),
});

export const ListNamespacesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(NamespaceSchema),
  message: z.string().optional(),
});

export const GetNamespaceResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceWithServersSchema.optional(),
  message: z.string().optional(),
});

// Get namespace tools from mapping table
export const GetNamespaceToolsRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
});

export const GetNamespaceToolsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(NamespaceToolSchema),
  message: z.string().optional(),
});

export const UpdateNamespaceRequestSchema = z.object({
  uuid: z.string(),
  name: z.string().min(1, "validation:namespaceName.required"),
  description: z.string().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smartDiscoveryEnabled: z.boolean().optional(),
  smartDiscoveryDescription: z.string().optional(),
  smartDiscoveryPinnedTools: z.array(z.string()).optional(),
});

export const UpdateNamespaceResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceSchema.optional(),
  message: z.string().optional(),
});

export const DeleteNamespaceRequestSchema = z.object({
  uuid: z.string(),
});

export const DeleteNamespaceResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// Namespace server status management schemas
export const UpdateNamespaceServerStatusRequestSchema = z.object({
  namespaceUuid: z.string(),
  serverUuid: z.string(),
  status: McpServerStatusEnum,
});

export const UpdateNamespaceServerStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// Namespace tool status management schemas
export const UpdateNamespaceToolStatusRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  toolUuid: z.string().uuid(),
  serverUuid: z.string().uuid(),
  status: ToolStatusEnum,
});

export const UpdateNamespaceToolStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Namespace tool overrides management schemas
export const UpdateNamespaceToolOverridesRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  toolUuid: z.string().uuid(),
  serverUuid: z.string().uuid(),
  overrideName: z.string().nullable().optional(),
  overrideTitle: z.string().nullable().optional(),
  overrideDescription: z.string().nullable().optional(),
  overrideAnnotations: ToolAnnotationsSchema.nullable().optional(),
});

export const UpdateNamespaceToolOverridesResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Refresh tools from MetaMCP connection
export const RefreshNamespaceToolsRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  tools: z.array(
    z.object({
      name: z.string(), // This will contain "ServerName__toolName" format
      description: z.string().optional(),
      inputSchema: z.record(z.any()),
      // Remove serverUuid since we'll resolve it from the tool name
    }),
  ),
});

export const RefreshNamespaceToolsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  toolsCreated: z.number().optional(),
  mappingsCreated: z.number().optional(),
});

// Namespace agent config (Smart Discovery: Ask Agent)
export const NamespaceAgentTypeSchema = z.enum(["ask"]);

export const NamespaceAgentSchema = z.object({
  uuid: z.string().uuid(),
  namespace_uuid: z.string().uuid(),
  agent_type: NamespaceAgentTypeSchema,
  name: z.string(),
  enabled: z.boolean(),
  model: z.string(),
  system_prompt: z.string(),
  references: z.record(z.any()),
  allowed_tools: z.array(z.string()),
  denied_tools: z.array(z.string()),
  max_tool_calls: z.number(),
  expose_limit: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const NamespaceAgentDocumentSchema = z.object({
  uuid: z.string().uuid(),
  agent_uuid: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  token_count: z.number(),
  content: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ListNamespaceAgentsRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
});

export const ListNamespaceAgentsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(NamespaceAgentSchema).optional(),
  message: z.string().optional(),
});

export const CreateNamespaceAgentRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  references: z.record(z.any()).optional(),
  denied_tools: z.array(z.string()).optional(),
  max_tool_calls: z.number().optional(),
  expose_limit: z.number().optional(),
});

export const CreateNamespaceAgentResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentSchema.optional(),
  message: z.string().optional(),
});

export const UpdateNamespaceAgentRequestSchema = z.object({
  agentUuid: z.string().uuid(),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  references: z.record(z.any()).optional(),
  denied_tools: z.array(z.string()).optional(),
  max_tool_calls: z.number().optional(),
  expose_limit: z.number().optional(),
});

export const UpdateNamespaceAgentResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentSchema.optional(),
  message: z.string().optional(),
});

export const DeleteNamespaceAgentRequestSchema = z.object({
  agentUuid: z.string().uuid(),
});

export const DeleteNamespaceAgentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const SetActiveAskAgentRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  agentUuid: z.string().uuid().nullable(),
});

export const SetActiveAskAgentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const ListNamespaceAgentDocumentsRequestSchema = z.object({
  agentUuid: z.string().uuid(),
});

export const ListNamespaceAgentDocumentsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(NamespaceAgentDocumentSchema).optional(),
  message: z.string().optional(),
});

export const UploadNamespaceAgentDocumentRequestSchema = z.object({
  agentUuid: z.string().uuid(),
  filename: z.string().min(1),
  mime: z.string().optional(),
  content: z.string().min(1),
});

export const UploadNamespaceAgentDocumentResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentDocumentSchema.optional(),
  message: z.string().optional(),
});

export const DeleteNamespaceAgentDocumentRequestSchema = z.object({
  docUuid: z.string().uuid(),
});

export const DeleteNamespaceAgentDocumentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const GetNamespaceAgentRequestSchema = z.object({
  agentUuid: z.string().uuid(),
});

export const GetNamespaceAgentResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentSchema.optional(),
  message: z.string().optional(),
});

export const GetNamespaceAskAgentConfigRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
});

export const GetNamespaceAskAgentConfigResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentSchema.optional(),
  message: z.string().optional(),
});

export const UpdateNamespaceAskAgentConfigRequestSchema = z.object({
  namespaceUuid: z.string().uuid(),
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  references: z.record(z.any()).optional(),
  allowed_tools: z.array(z.string()).optional(),
  denied_tools: z.array(z.string()).optional(),
  max_tool_calls: z.number().optional(),
  expose_limit: z.number().optional(),
});

export const UpdateNamespaceAskAgentConfigResponseSchema = z.object({
  success: z.boolean(),
  data: NamespaceAgentSchema.optional(),
  message: z.string().optional(),
});

// Type exports
export type CreateNamespaceRequest = z.infer<
  typeof CreateNamespaceRequestSchema
>;
export type Namespace = z.infer<typeof NamespaceSchema>;
export type NamespaceServer = z.infer<typeof NamespaceServerSchema>;
export type NamespaceTool = z.infer<typeof NamespaceToolSchema>;
export type NamespaceWithServers = z.infer<typeof NamespaceWithServersSchema>;
export type CreateNamespaceResponse = z.infer<
  typeof CreateNamespaceResponseSchema
>;
export type ListNamespacesResponse = z.infer<
  typeof ListNamespacesResponseSchema
>;
export type GetNamespaceResponse = z.infer<typeof GetNamespaceResponseSchema>;
export type GetNamespaceToolsRequest = z.infer<
  typeof GetNamespaceToolsRequestSchema
>;
export type GetNamespaceToolsResponse = z.infer<
  typeof GetNamespaceToolsResponseSchema
>;
export type UpdateNamespaceRequest = z.infer<
  typeof UpdateNamespaceRequestSchema
>;
export type UpdateNamespaceResponse = z.infer<
  typeof UpdateNamespaceResponseSchema
>;
export type DeleteNamespaceRequest = z.infer<
  typeof DeleteNamespaceRequestSchema
>;
export type DeleteNamespaceResponse = z.infer<
  typeof DeleteNamespaceResponseSchema
>;
export type UpdateNamespaceServerStatusRequest = z.infer<
  typeof UpdateNamespaceServerStatusRequestSchema
>;
export type UpdateNamespaceServerStatusResponse = z.infer<
  typeof UpdateNamespaceServerStatusResponseSchema
>;
export type UpdateNamespaceToolStatusRequest = z.infer<
  typeof UpdateNamespaceToolStatusRequestSchema
>;
export type UpdateNamespaceToolStatusResponse = z.infer<
  typeof UpdateNamespaceToolStatusResponseSchema
>;
export type UpdateNamespaceToolOverridesRequest = z.infer<
  typeof UpdateNamespaceToolOverridesRequestSchema
>;
export type UpdateNamespaceToolOverridesResponse = z.infer<
  typeof UpdateNamespaceToolOverridesResponseSchema
>;

export type NamespaceAgentType = z.infer<typeof NamespaceAgentTypeSchema>;
export type NamespaceAgent = z.infer<typeof NamespaceAgentSchema>;
export type NamespaceAgentDocument = z.infer<typeof NamespaceAgentDocumentSchema>;
export type ListNamespaceAgentsRequest = z.infer<typeof ListNamespaceAgentsRequestSchema>;
export type ListNamespaceAgentsResponse = z.infer<typeof ListNamespaceAgentsResponseSchema>;
export type CreateNamespaceAgentRequest = z.infer<typeof CreateNamespaceAgentRequestSchema>;
export type CreateNamespaceAgentResponse = z.infer<typeof CreateNamespaceAgentResponseSchema>;
export type UpdateNamespaceAgentRequest = z.infer<typeof UpdateNamespaceAgentRequestSchema>;
export type UpdateNamespaceAgentResponse = z.infer<typeof UpdateNamespaceAgentResponseSchema>;
export type DeleteNamespaceAgentRequest = z.infer<typeof DeleteNamespaceAgentRequestSchema>;
export type DeleteNamespaceAgentResponse = z.infer<typeof DeleteNamespaceAgentResponseSchema>;
export type SetActiveAskAgentRequest = z.infer<typeof SetActiveAskAgentRequestSchema>;
export type SetActiveAskAgentResponse = z.infer<typeof SetActiveAskAgentResponseSchema>;
export type ListNamespaceAgentDocumentsRequest = z.infer<
  typeof ListNamespaceAgentDocumentsRequestSchema
>;
export type ListNamespaceAgentDocumentsResponse = z.infer<
  typeof ListNamespaceAgentDocumentsResponseSchema
>;
export type UploadNamespaceAgentDocumentRequest = z.infer<
  typeof UploadNamespaceAgentDocumentRequestSchema
>;
export type UploadNamespaceAgentDocumentResponse = z.infer<
  typeof UploadNamespaceAgentDocumentResponseSchema
>;
export type DeleteNamespaceAgentDocumentRequest = z.infer<
  typeof DeleteNamespaceAgentDocumentRequestSchema
>;
export type DeleteNamespaceAgentDocumentResponse = z.infer<
  typeof DeleteNamespaceAgentDocumentResponseSchema
>;
export type GetNamespaceAgentRequest = z.infer<typeof GetNamespaceAgentRequestSchema>;
export type GetNamespaceAgentResponse = z.infer<typeof GetNamespaceAgentResponseSchema>;
export type GetNamespaceAskAgentConfigRequest = z.infer<
  typeof GetNamespaceAskAgentConfigRequestSchema
>;
export type GetNamespaceAskAgentConfigResponse = z.infer<
  typeof GetNamespaceAskAgentConfigResponseSchema
>;
export type UpdateNamespaceAskAgentConfigRequest = z.infer<
  typeof UpdateNamespaceAskAgentConfigRequestSchema
>;
export type UpdateNamespaceAskAgentConfigResponse = z.infer<
  typeof UpdateNamespaceAskAgentConfigResponseSchema
>;

// Repository-specific schemas
export const NamespaceCreateInputSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smart_discovery_enabled: z.boolean().optional().default(false),
  smart_discovery_description: z.string().nullable().optional(),
  smart_discovery_pinned_tools: z.array(z.string()).optional().default([]),
});

export const NamespaceUpdateInputSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  mcpServerUuids: z.array(z.string()).optional(),
  user_id: z.string().nullable().optional(),
  smart_discovery_enabled: z.boolean().optional(),
  smart_discovery_description: z.string().nullable().optional(),
  smart_discovery_pinned_tools: z.array(z.string()).optional(),
});

export const NamespaceServerStatusUpdateSchema = z.object({
  namespaceUuid: z.string(),
  serverUuid: z.string(),
  status: McpServerStatusEnum,
});

export const NamespaceToolStatusUpdateSchema = z.object({
  namespaceUuid: z.string(),
  toolUuid: z.string(),
  serverUuid: z.string(),
  status: ToolStatusEnum,
});

export const NamespaceToolOverridesUpdateSchema = z.object({
  namespaceUuid: z.string(),
  toolUuid: z.string(),
  serverUuid: z.string(),
  overrideName: z.string().nullable().optional(),
  overrideTitle: z.string().nullable().optional(),
  overrideDescription: z.string().nullable().optional(),
  overrideAnnotations: ToolAnnotationsSchema.nullable().optional(),
});

export type NamespaceCreateInput = z.infer<typeof NamespaceCreateInputSchema>;
export type NamespaceUpdateInput = z.infer<typeof NamespaceUpdateInputSchema>;
export type NamespaceServerStatusUpdate = z.infer<
  typeof NamespaceServerStatusUpdateSchema
>;
export type NamespaceToolStatusUpdate = z.infer<
  typeof NamespaceToolStatusUpdateSchema
>;
export type NamespaceToolOverridesUpdate = z.infer<
  typeof NamespaceToolOverridesUpdateSchema
>;

// Database-specific schemas (raw database results with Date objects)
export const DatabaseNamespaceSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
  user_id: z.string().nullable(),
  smart_discovery_enabled: z.boolean(),
  smart_discovery_description: z.string().nullable(),
  smart_discovery_pinned_tools: z.array(z.string()).default([]),
});

export const DatabaseNamespaceServerSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(["STDIO", "SSE", "STREAMABLE_HTTP"]),
  command: z.string().nullable(),
  args: z.array(z.string()),
  url: z.string().nullable(),
  env: z.record(z.string()),
  bearerToken: z.string().nullable(),
  headers: z.record(z.string()),
  created_at: z.date(),
  user_id: z.string().nullable(),
  status: McpServerStatusEnum,
  error_status: McpServerErrorStatusEnum.optional(),
});

export const DatabaseNamespaceWithServersSchema =
  DatabaseNamespaceSchema.extend({
    servers: z.array(DatabaseNamespaceServerSchema),
  });

export const DatabaseNamespaceToolSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  toolSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.any()).optional(),
  }),
  created_at: z.date(),
  updated_at: z.date(),
  mcp_server_uuid: z.string(),
  status: ToolStatusEnum,
  serverName: z.string(),
  serverUuid: z.string(),
  overrideName: z.string().nullable().optional(),
  overrideTitle: z.string().nullable().optional(),
  overrideDescription: z.string().nullable().optional(),
  overrideAnnotations: ToolAnnotationsSchema.nullable().optional(),
});

export type DatabaseNamespace = z.infer<typeof DatabaseNamespaceSchema>;
export type DatabaseNamespaceWithServers = z.infer<
  typeof DatabaseNamespaceWithServersSchema
>;
export type DatabaseNamespaceTool = z.infer<typeof DatabaseNamespaceToolSchema>;
