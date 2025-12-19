import {
  CreateNamespaceRequestSchema,
  CreateNamespaceResponseSchema,
  CreateNamespaceAgentRequestSchema,
  CreateNamespaceAgentResponseSchema,
  DeleteNamespaceResponseSchema,
  DeleteNamespaceAgentRequestSchema,
  DeleteNamespaceAgentResponseSchema,
  DeleteNamespaceAgentDocumentRequestSchema,
  DeleteNamespaceAgentDocumentResponseSchema,
  GetNamespaceAskAgentConfigRequestSchema,
  GetNamespaceAskAgentConfigResponseSchema,
  GetNamespaceAgentRequestSchema,
  GetNamespaceAgentResponseSchema,
  GetNamespaceResponseSchema,
  GetNamespaceToolsRequestSchema,
  GetNamespaceToolsResponseSchema,
  ListNamespaceAgentsRequestSchema,
  ListNamespaceAgentsResponseSchema,
  ListNamespaceAgentDocumentsRequestSchema,
  ListNamespaceAgentDocumentsResponseSchema,
  ListNamespacesResponseSchema,
  McpServer,
  RefreshNamespaceToolsRequestSchema,
  RefreshNamespaceToolsResponseSchema,
  SetActiveAskAgentRequestSchema,
  SetActiveAskAgentResponseSchema,
  UploadNamespaceAgentDocumentRequestSchema,
  UploadNamespaceAgentDocumentResponseSchema,
  UpdateNamespaceAskAgentConfigRequestSchema,
  UpdateNamespaceAskAgentConfigResponseSchema,
  UpdateNamespaceAgentRequestSchema,
  UpdateNamespaceAgentResponseSchema,
  UpdateNamespaceRequestSchema,
  UpdateNamespaceResponseSchema,
  UpdateNamespaceServerStatusRequestSchema,
  UpdateNamespaceServerStatusResponseSchema,
  UpdateNamespaceToolOverridesRequestSchema,
  UpdateNamespaceToolOverridesResponseSchema,
  UpdateNamespaceToolStatusRequestSchema,
  UpdateNamespaceToolStatusResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import {
  mcpServersRepository,
  namespaceAgentDocumentsRepository,
  namespaceAgentsRepository,
  namespaceMappingsRepository,
  namespacesRepository,
  toolsRepository,
} from "../db/repositories";
import { NamespacesSerializer } from "../db/serializers";
import {
  clearOverrideCache,
  mapOverrideNameToOriginal,
} from "../lib/metamcp/metamcp-middleware/tool-overrides.functional";
import { clearSmartDiscoveryCache } from "../lib/metamcp/metamcp-middleware/smart-discovery.functional";
import { metaMcpServerPool } from "../lib/metamcp/metamcp-server-pool";
import { parseToolName } from "../lib/metamcp/tool-name-parser";
import { tokenCounter } from "../lib/tokens/token-counter";

const serializeNamespaceAgent = (row: any) => {
  return {
    uuid: row.uuid,
    namespace_uuid: row.namespace_uuid,
    agent_type: row.agent_type,
    name: row.name ?? "Default Ask Agent",
    enabled: row.enabled,
    model: row.model,
    system_prompt: row.system_prompt,
    references: row.references ?? {},
    allowed_tools: row.allowed_tools ?? [],
    denied_tools: row.denied_tools ?? [],
    max_tool_calls: row.max_tool_calls,
    expose_limit: row.expose_limit,
    created_at: row.created_at?.toISOString?.() ?? String(row.created_at),
    updated_at: row.updated_at?.toISOString?.() ?? String(row.updated_at),
  };
};

const serializeAgentDoc = (row: any) => {
  return {
    uuid: row.uuid,
    agent_uuid: row.agent_uuid,
    filename: row.filename,
    mime: row.mime,
    token_count: row.token_count ?? 0,
    content: row.content,
    created_at: row.created_at?.toISOString?.() ?? String(row.created_at),
    updated_at: row.updated_at?.toISOString?.() ?? String(row.updated_at),
  };
};

export const namespacesImplementations = {
  create: async (
    input: z.infer<typeof CreateNamespaceRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof CreateNamespaceResponseSchema>> => {
    try {
      // Determine user ownership based on input.user_id or default to current user
      const effectiveUserId =
        input.user_id !== undefined ? input.user_id : userId;
      const isPublicNamespace = effectiveUserId === null;

      // Validate server accessibility and relationship rules
      if (input.mcpServerUuids && input.mcpServerUuids.length > 0) {
        // Get detailed server information to validate access and ownership
        const serverPromises = input.mcpServerUuids.map((uuid: string) =>
          mcpServersRepository.findByUuid(uuid),
        );
        const servers = await Promise.all(serverPromises);

        // Check if any servers don't exist
        const missingServers = servers.some((server) => !server);
        if (missingServers) {
          return {
            success: false as const,
            message: "One or more selected MCP servers could not be found",
          };
        }

        // Validate access and relationship rules
        for (const server of servers as Array<McpServer | undefined>) {
          if (!server) continue;

          // Check if user has access to this server (own server or public server)
          if (server.user_id && server.user_id !== userId) {
            return {
              success: false as const,
              message: `Access denied: You don't have permission to use server "${server.name}"`,
            };
          }

          // Enforce relationship rules: public namespaces can only contain public servers
          if (isPublicNamespace && server.user_id !== null) {
            return {
              success: false as const,
              message: `Access denied: Public namespaces can only contain public MCP servers. Server "${server.name}" is private`,
            };
          }
        }
      }

      const result = await namespacesRepository.create({
        name: input.name,
        description: input.description,
        mcpServerUuids: input.mcpServerUuids,
        user_id: effectiveUserId,
        smart_discovery_enabled: input.smartDiscoveryEnabled ?? false,
        smart_discovery_description: input.smartDiscoveryDescription,
        smart_discovery_pinned_tools: [],
      });

      // Ensure idle MetaMCP server exists for the new namespace to improve performance
      // Run this asynchronously to avoid blocking the response
      metaMcpServerPool
        .ensureIdleServerForNewNamespace(result.uuid)
        .then(() => {
          console.log(
            `Ensured idle MetaMCP server exists for new namespace ${result.uuid}`,
          );
        })
        .catch((error) => {
          console.error(
            `Error ensuring idle MetaMCP server for new namespace ${result.uuid}:`,
            error,
          );
          // Don't fail the entire create operation if idle server creation fails
        });

      return {
        success: true as const,
        data: NamespacesSerializer.serializeNamespace(result),
        message: "Namespace created successfully",
      };
    } catch (error) {
      console.error("Error creating namespace:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  list: async (
    userId: string,
  ): Promise<z.infer<typeof ListNamespacesResponseSchema>> => {
    try {
      // Find namespaces accessible to user (public + user's own)
      const namespaces =
        await namespacesRepository.findAllAccessibleToUser(userId);

      return {
        success: true as const,
        data: NamespacesSerializer.serializeNamespaceList(namespaces),
        message: "Namespaces retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching namespaces:", error);
      return {
        success: false as const,
        data: [],
        message: "Failed to fetch namespaces",
      };
    }
  },

  get: async (
    input: {
      uuid: string;
    },
    userId: string,
  ): Promise<z.infer<typeof GetNamespaceResponseSchema>> => {
    try {
      const namespaceWithServers =
        await namespacesRepository.findByUuidWithServers(input.uuid);

      if (!namespaceWithServers) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user has access to this namespace (own namespace or public namespace)
      if (
        namespaceWithServers.user_id &&
        namespaceWithServers.user_id !== userId
      ) {
        return {
          success: false as const,
          message:
            "Access denied: You can only view namespaces you own or public namespaces",
        };
      }

      return {
        success: true as const,
        data: NamespacesSerializer.serializeNamespaceWithServers(
          namespaceWithServers,
        ),
        message: "Namespace retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching namespace:", error);
      return {
        success: false as const,
        message: "Failed to fetch namespace",
      };
    }
  },

  getTools: async (
    input: z.infer<typeof GetNamespaceToolsRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof GetNamespaceToolsResponseSchema>> => {
    try {
      // First, check if user has access to this namespace
      const namespace = await namespacesRepository.findByUuid(
        input.namespaceUuid,
      );

      if (!namespace) {
        return {
          success: false as const,
          data: [],
          message: "Namespace not found",
        };
      }

      // Check if user has access to this namespace (own namespace or public namespace)
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          data: [],
          message:
            "Access denied: You can only view tools for namespaces you own or public namespaces",
        };
      }

      const toolsData = await namespacesRepository.findToolsByNamespaceUuid(
        input.namespaceUuid,
      );

      return {
        success: true as const,
        data: NamespacesSerializer.serializeNamespaceTools(toolsData),
        message: "Namespace tools retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching namespace tools:", error);
      return {
        success: false as const,
        data: [],
        message: "Failed to fetch namespace tools",
      };
    }
  },

  delete: async (
    input: {
      uuid: string;
    },
    userId: string,
  ): Promise<z.infer<typeof DeleteNamespaceResponseSchema>> => {
    try {
      // First, check if the namespace exists and user has permission to delete it
      const existingNamespace = await namespacesRepository.findByUuid(
        input.uuid,
      );

      if (!existingNamespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can delete, protect public namespaces)
      if (existingNamespace.user_id && existingNamespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only delete namespaces you own",
        };
      }

      const deletedNamespace = await namespacesRepository.deleteByUuid(
        input.uuid,
      );

      if (!deletedNamespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Clean up idle MetaMCP server for the deleted namespace
      try {
        await metaMcpServerPool.cleanupIdleServer(input.uuid);
        console.log(
          `Cleaned up idle MetaMCP server for deleted namespace ${input.uuid}`,
        );
      } catch (error) {
        console.error(
          `Error cleaning up idle MetaMCP server for deleted namespace ${input.uuid}:`,
          error,
        );
        // Don't fail the entire delete operation if idle server cleanup fails
      }

      // Clear the tool overrides cache for the deleted namespace
      clearOverrideCache(input.uuid);
      console.log(
        `Cleared tool overrides cache for deleted namespace ${input.uuid}`,
      );

      return {
        success: true as const,
        message: "Namespace deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting namespace:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  update: async (
    input: z.infer<typeof UpdateNamespaceRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceResponseSchema>> => {
    try {
      // First, check if the namespace exists and user has permission to update it
      const existingNamespace = await namespacesRepository.findByUuid(
        input.uuid,
      );

      if (!existingNamespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can update)
      if (existingNamespace.user_id && existingNamespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only update namespaces you own",
        };
      }

      // Determine the effective ownership for validation (use input.user_id if provided, otherwise existing)
      const effectiveUserId =
        input.user_id !== undefined ? input.user_id : existingNamespace.user_id;
      const isPublicNamespace = effectiveUserId === null;

      // Validate server accessibility and relationship rules if servers are being updated
      if (input.mcpServerUuids && input.mcpServerUuids.length > 0) {
        // Get detailed server information to validate access and ownership
        const serverPromises = input.mcpServerUuids.map((uuid: string) =>
          mcpServersRepository.findByUuid(uuid),
        );
        const servers = await Promise.all(serverPromises);

        // Check if any servers don't exist
        const missingServers = servers.some((server) => !server);
        if (missingServers) {
          return {
            success: false as const,
            message: "One or more selected MCP servers could not be found",
          };
        }

        // Validate access and relationship rules
        for (const server of servers as Array<McpServer | undefined>) {
          if (!server) continue;

          // Check if user has access to this server (own server or public server)
          if (server.user_id && server.user_id !== userId) {
            return {
              success: false as const,
              message: `Access denied: You don't have permission to use server "${server.name}"`,
            };
          }

          // Enforce relationship rules: public namespaces can only contain public servers
          if (isPublicNamespace && server.user_id !== null) {
            return {
              success: false as const,
              message: `Access denied: Public namespaces can only contain public MCP servers. Server "${server.name}" is private`,
            };
          }
        }
      }

      const result = await namespacesRepository.update({
        uuid: input.uuid,
        name: input.name,
        description: input.description,
        user_id: input.user_id,
        mcpServerUuids: input.mcpServerUuids,
        smart_discovery_enabled: input.smartDiscoveryEnabled,
        smart_discovery_description: input.smartDiscoveryDescription,
        smart_discovery_pinned_tools: input.smartDiscoveryPinnedTools,
      });

      // Invalidate idle MetaMCP server for this namespace since the MCP servers list may have changed
      // Run this asynchronously to avoid blocking the response
      metaMcpServerPool
        .invalidateIdleServer(input.uuid)
        .then(() => {
          console.log(
            `Invalidated idle MetaMCP server for updated namespace ${input.uuid}`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating idle MetaMCP server for namespace ${input.uuid}:`,
            error,
          );
          // Don't fail the entire update operation if idle server invalidation fails
        });

      // Also invalidate OpenAPI sessions for this namespace
      metaMcpServerPool
        .invalidateOpenApiSessions([input.uuid])
        .then(() => {
          console.log(
            `Invalidated OpenAPI session for updated namespace ${input.uuid}`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating OpenAPI session for namespace ${input.uuid}:`,
            error,
          );
          // Don't fail the entire update operation if OpenAPI session invalidation fails
        });

      // Clear tool overrides cache for this namespace since MCP servers list may have changed
      clearOverrideCache(input.uuid);
      console.log(
        `Cleared tool overrides cache for updated namespace ${input.uuid}`,
      );

      // Clear smart discovery cache if the setting changed
      if (input.smartDiscoveryEnabled !== undefined) {
        clearSmartDiscoveryCache(input.uuid);
        console.log(
          `Cleared smart discovery cache for updated namespace ${input.uuid}`,
        );
      }

      return {
        success: true as const,
        data: NamespacesSerializer.serializeNamespace(result),
        message: "Namespace updated successfully",
      };
    } catch (error) {
      console.error("Error updating namespace:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  getAgent: async (
    input: z.infer<typeof GetNamespaceAgentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof GetNamespaceAgentResponseSchema>> => {
    try {
      const agent = await namespaceAgentsRepository.getByUuid(input.agentUuid);
      if (!agent) {
        return { success: false as const, message: "Agent not found" };
      }

      const namespace = await namespacesRepository.findByUuid(agent.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }

      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only view agents for namespaces you own or public namespaces",
        };
      }

      return {
        success: true as const,
        data: serializeNamespaceAgent(agent) as any,
        message: "Agent retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching agent:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  listAgents: async (
    input: z.infer<typeof ListNamespaceAgentsRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof ListNamespaceAgentsResponseSchema>> => {
    try {
      const namespace = await namespacesRepository.findByUuid(input.namespaceUuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only view agents for namespaces you own or public namespaces",
        };
      }

      const agents = await namespaceAgentsRepository.listByNamespace(
        input.namespaceUuid,
      );

      return {
        success: true as const,
        data: agents.map(serializeNamespaceAgent),
        message: "Agents retrieved successfully",
      };
    } catch (error) {
      console.error("Error listing agents:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  createAgent: async (
    input: z.infer<typeof CreateNamespaceAgentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof CreateNamespaceAgentResponseSchema>> => {
    try {
      const namespace = await namespacesRepository.findByUuid(input.namespaceUuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only create agents for namespaces you own",
        };
      }

      const agent = await namespaceAgentsRepository.create({
        namespace_uuid: input.namespaceUuid,
        name: input.name,
        agent_type: "ask",
        enabled: input.enabled,
        model: input.model,
        system_prompt: input.system_prompt,
        references: input.references,
        denied_tools: input.denied_tools,
        max_tool_calls: input.max_tool_calls,
        expose_limit: input.expose_limit,
      } as any);

      return {
        success: true as const,
        data: serializeNamespaceAgent(agent),
        message: "Agent created successfully",
      };
    } catch (error) {
      console.error("Error creating agent:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  updateAgent: async (
    input: z.infer<typeof UpdateNamespaceAgentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceAgentResponseSchema>> => {
    try {
      const existing = await namespaceAgentsRepository.getByUuid(input.agentUuid);
      if (!existing) {
        return { success: false as const, message: "Agent not found" };
      }

      const namespace = await namespacesRepository.findByUuid(existing.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only update agents for namespaces you own",
        };
      }

      const updated = await namespaceAgentsRepository.update({
        uuid: input.agentUuid,
        name: input.name,
        enabled: input.enabled,
        model: input.model,
        system_prompt: input.system_prompt,
        references: input.references,
        denied_tools: input.denied_tools,
        max_tool_calls: input.max_tool_calls,
        expose_limit: input.expose_limit,
      } as any);

      return {
        success: true as const,
        data: serializeNamespaceAgent(updated),
        message: "Agent updated successfully",
      };
    } catch (error) {
      console.error("Error updating agent:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  deleteAgent: async (
    input: z.infer<typeof DeleteNamespaceAgentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof DeleteNamespaceAgentResponseSchema>> => {
    try {
      const existing = await namespaceAgentsRepository.getByUuid(input.agentUuid);
      if (!existing) {
        return { success: false as const, message: "Agent not found" };
      }
      const namespace = await namespacesRepository.findByUuid(existing.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only delete agents for namespaces you own",
        };
      }

      // If the deleted agent is currently selected, clear it
      if ((namespace as any).ask_agent_uuid === input.agentUuid) {
        await namespacesRepository.update({
          uuid: namespace.uuid,
          name: namespace.name,
          description: namespace.description,
          user_id: namespace.user_id,
          ask_agent_uuid: null,
        } as any);
      }

      await namespaceAgentsRepository.delete(input.agentUuid);

      return { success: true as const, message: "Agent deleted successfully" };
    } catch (error) {
      console.error("Error deleting agent:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  setActiveAskAgent: async (
    input: z.infer<typeof SetActiveAskAgentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof SetActiveAskAgentResponseSchema>> => {
    try {
      const namespace = await namespacesRepository.findByUuid(input.namespaceUuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only update namespaces you own",
        };
      }

      if (input.agentUuid) {
        const agent = await namespaceAgentsRepository.getByUuid(input.agentUuid);
        if (!agent || agent.namespace_uuid !== input.namespaceUuid) {
          return {
            success: false as const,
            message: "Agent not found for this namespace",
          };
        }
      }

      await namespacesRepository.update({
        uuid: namespace.uuid,
        name: namespace.name,
        description: namespace.description,
        user_id: namespace.user_id,
        ask_agent_uuid: input.agentUuid,
      } as any);

      return { success: true as const, message: "Active ask agent updated" };
    } catch (error) {
      console.error("Error setting active ask agent:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  listAgentDocuments: async (
    input: z.infer<typeof ListNamespaceAgentDocumentsRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof ListNamespaceAgentDocumentsResponseSchema>> => {
    try {
      const agent = await namespaceAgentsRepository.getByUuid(input.agentUuid);
      if (!agent) {
        return { success: false as const, message: "Agent not found" };
      }
      const namespace = await namespacesRepository.findByUuid(agent.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only view docs for agents you own",
        };
      }

      const docs = await namespaceAgentDocumentsRepository.listByAgent(
        input.agentUuid,
      );
      return {
        success: true as const,
        data: docs.map(serializeAgentDoc),
        message: "Documents retrieved successfully",
      };
    } catch (error) {
      console.error("Error listing agent documents:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  uploadAgentDocument: async (
    input: z.infer<typeof UploadNamespaceAgentDocumentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UploadNamespaceAgentDocumentResponseSchema>> => {
    try {
      const agent = await namespaceAgentsRepository.getByUuid(input.agentUuid);
      if (!agent) {
        return { success: false as const, message: "Agent not found" };
      }
      const namespace = await namespacesRepository.findByUuid(agent.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only upload docs for agents you own",
        };
      }

      // Enforce token budget (sum docs + new doc) <= 200k
      const existingDocs = await namespaceAgentDocumentsRepository.listByAgent(
        input.agentUuid,
      );
      const model = agent.model || "gpt-4o-mini";
      const existingTokens = existingDocs.reduce(
        (sum, d) => sum + ((d as any).token_count ?? 0),
        0,
      );
      const newTokens = tokenCounter.count(model, input.content);
      const limit = 200_000;
      if (existingTokens + newTokens > limit) {
        return {
          success: false as const,
          message: `Token budget exceeded for agent docs: ${existingTokens + newTokens}/${limit} tokens`,
        };
      }

      const doc = await namespaceAgentDocumentsRepository.addDoc({
        agent_uuid: input.agentUuid,
        filename: input.filename,
        mime: input.mime,
        content: input.content,
        token_model: model,
      });

      return {
        success: true as const,
        data: serializeAgentDoc(doc) as any,
        message: "Document uploaded successfully",
      };
    } catch (error) {
      console.error("Error uploading agent document:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  deleteAgentDocument: async (
    input: z.infer<typeof DeleteNamespaceAgentDocumentRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof DeleteNamespaceAgentDocumentResponseSchema>> => {
    try {
      // We don't have doc->agent query in repo; simplest MVP: just delete (FK cascade ensures ownership via UI)
      // Safer: require ownership by joining doc->agent->namespace. We'll add that now.
      const doc = await namespaceAgentDocumentsRepository.getByUuid(input.docUuid);
      if (!doc) {
        return { success: false as const, message: "Document not found" };
      }
      const agent = await namespaceAgentsRepository.getByUuid(doc.agent_uuid);
      if (!agent) {
        return { success: false as const, message: "Agent not found" };
      }
      const namespace = await namespacesRepository.findByUuid(agent.namespace_uuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }
      if (!namespace.user_id || namespace.user_id !== userId) {
        return {
          success: false as const,
          message: "Access denied: You can only delete docs for agents you own",
        };
      }

      await namespaceAgentDocumentsRepository.delete(input.docUuid);
      return { success: true as const, message: "Document deleted successfully" };
    } catch (error) {
      console.error("Error deleting agent document:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  getAskAgentConfig: async (
    input: z.infer<typeof GetNamespaceAskAgentConfigRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof GetNamespaceAskAgentConfigResponseSchema>> => {
    try {
      const namespace = await namespacesRepository.findByUuid(input.namespaceUuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }

      // Match existing access model: allow access to public or owned namespaces
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only view agent config for namespaces you own or public namespaces",
        };
      }

      const row =
        (await namespaceAgentsRepository.getByNamespaceAndType(
          input.namespaceUuid,
          "ask",
        )) ??
        (await namespaceAgentsRepository.upsert({
          namespace_uuid: input.namespaceUuid,
          agent_type: "ask",
        }));

      return {
        success: true as const,
        data: serializeNamespaceAgent(row),
        message: "Ask agent config retrieved successfully",
      };
    } catch (error) {
      console.error("Error fetching ask agent config:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  updateAskAgentConfig: async (
    input: z.infer<typeof UpdateNamespaceAskAgentConfigRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceAskAgentConfigResponseSchema>> => {
    try {
      const namespace = await namespacesRepository.findByUuid(input.namespaceUuid);
      if (!namespace) {
        return { success: false as const, message: "Namespace not found" };
      }

      // Match existing access model: allow updates to public or owned namespaces
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only update agent config for namespaces you own",
        };
      }

      const row = await namespaceAgentsRepository.upsert({
        namespace_uuid: input.namespaceUuid,
        agent_type: "ask",
        enabled: input.enabled,
        model: input.model,
        system_prompt: input.system_prompt,
        references: input.references,
        allowed_tools: input.allowed_tools,
        denied_tools: input.denied_tools,
        max_tool_calls: input.max_tool_calls,
        expose_limit: input.expose_limit,
      });

      return {
        success: true as const,
        data: serializeNamespaceAgent(row),
        message: "Ask agent config updated successfully",
      };
    } catch (error) {
      console.error("Error updating ask agent config:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  updateServerStatus: async (
    input: z.infer<typeof UpdateNamespaceServerStatusRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceServerStatusResponseSchema>> => {
    try {
      // First, check if user has permission to update this namespace
      const namespace = await namespacesRepository.findByUuid(
        input.namespaceUuid,
      );

      if (!namespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can update server status)
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only update server status for namespaces you own",
        };
      }

      const updatedMapping =
        await namespaceMappingsRepository.updateServerStatus({
          namespaceUuid: input.namespaceUuid,
          serverUuid: input.serverUuid,
          status: input.status,
        });

      if (!updatedMapping) {
        return {
          success: false as const,
          message: "Server not found in namespace",
        };
      }

      // Invalidate idle MetaMCP server for this namespace since server status changed
      // Run this asynchronously to avoid blocking the response
      metaMcpServerPool
        .invalidateIdleServer(input.namespaceUuid)
        .then(() => {
          console.log(
            `Invalidated idle MetaMCP server for namespace ${input.namespaceUuid} after server status update`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating idle MetaMCP server for namespace ${input.namespaceUuid}:`,
            error,
          );
          // Don't fail the entire operation if idle server invalidation fails
        });

      // Also invalidate OpenAPI sessions for this namespace
      metaMcpServerPool
        .invalidateOpenApiSessions([input.namespaceUuid])
        .then(() => {
          console.log(
            `Invalidated OpenAPI session for namespace ${input.namespaceUuid} after server status update`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating OpenAPI session for namespace ${input.namespaceUuid}:`,
            error,
          );
          // Don't fail the entire operation if OpenAPI session invalidation fails
        });

      return {
        success: true as const,
        message: "Server status updated successfully",
      };
    } catch (error) {
      console.error("Error updating server status:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  updateToolStatus: async (
    input: z.infer<typeof UpdateNamespaceToolStatusRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceToolStatusResponseSchema>> => {
    try {
      // First, check if user has permission to update this namespace
      const namespace = await namespacesRepository.findByUuid(
        input.namespaceUuid,
      );

      if (!namespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can update tool status)
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only update tool status for namespaces you own",
        };
      }

      const updatedMapping = await namespaceMappingsRepository.updateToolStatus(
        {
          namespaceUuid: input.namespaceUuid,
          toolUuid: input.toolUuid,
          serverUuid: input.serverUuid,
          status: input.status,
        },
      );

      if (!updatedMapping) {
        return {
          success: false as const,
          message: "Tool not found in namespace",
        };
      }

      return {
        success: true as const,
        message: "Tool status updated successfully",
      };
    } catch (error) {
      console.error("Error updating tool status:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  updateToolOverrides: async (
    input: z.infer<typeof UpdateNamespaceToolOverridesRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof UpdateNamespaceToolOverridesResponseSchema>> => {
    try {
      // First, check if user has permission to update this namespace
      const namespace = await namespacesRepository.findByUuid(
        input.namespaceUuid,
      );

      if (!namespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can update tool overrides)
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only update tool overrides for namespaces you own",
        };
      }

      const updatedMapping =
        await namespaceMappingsRepository.updateToolOverrides({
          namespaceUuid: input.namespaceUuid,
          toolUuid: input.toolUuid,
          serverUuid: input.serverUuid,
          overrideName: input.overrideName,
          overrideTitle: input.overrideTitle,
          overrideDescription: input.overrideDescription,
          overrideAnnotations: input.overrideAnnotations,
        });

      if (!updatedMapping) {
        return {
          success: false as const,
          message: "Tool not found in namespace",
        };
      }

      // Clear the tool overrides cache for this namespace to ensure fresh data is loaded
      clearOverrideCache(input.namespaceUuid);
      console.log(
        `Cleared tool overrides cache for namespace ${input.namespaceUuid} after updating tool overrides`,
      );

      return {
        success: true as const,
        message: "Tool overrides updated successfully",
      };
    } catch (error) {
      console.error("Error updating tool overrides:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },

  refreshTools: async (
    input: z.infer<typeof RefreshNamespaceToolsRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof RefreshNamespaceToolsResponseSchema>> => {
    try {
      // First, check if user has permission to refresh tools for this namespace
      const namespace = await namespacesRepository.findByUuid(
        input.namespaceUuid,
      );

      if (!namespace) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Check if user owns this namespace (only owners can refresh tools)
      if (namespace.user_id && namespace.user_id !== userId) {
        return {
          success: false as const,
          message:
            "Access denied: You can only refresh tools for namespaces you own",
        };
      }

      if (!input.tools || input.tools.length === 0) {
        return {
          success: true as const,
          message: "No tools to refresh",
          toolsCreated: 0,
          mappingsCreated: 0,
        };
      }

      // Parse tool names to extract server names and actual tool names
      // Important: The input tools may have overridden names applied by MetaMCP middleware
      // We need to map them back to original names to avoid overwriting original names in the database
      const parsedTools: Array<{
        serverName: string;
        toolName: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }> = [];

      for (const tool of input.tools) {
        // Use the shared parser to ensure consistency with frontend
        const parsed = parseToolName(tool.name);

        if (!parsed) {
          console.warn(
            `Tool name "${tool.name}" does not contain "__" separator, skipping`,
          );
          continue;
        }

        let serverName = parsed.serverName;
        let toolName = parsed.originalToolName;

        // Check if this tool name might be an override name by looking up the original name
        // If it is an override name, skip this tool entirely to avoid duplicates
        try {
          const fullToolName = `${serverName}__${toolName}`;
          const originalToolName = await mapOverrideNameToOriginal(
            fullToolName,
            input.namespaceUuid,
          );

          // If we found an original name mapping, this means the current toolName is an override
          // Skip this tool to avoid creating duplicates
          if (originalToolName !== fullToolName) {
            console.log(
              `Skipping override tool "${fullToolName}" as it maps to original "${originalToolName}"`,
            );
            continue;
          }
        } catch (error) {
          // If mapping fails, continue with the parsed name (it's likely an original tool)
          console.warn(
            `Failed to map override name for tool "${toolName}":`,
            error,
          );
        }

        if (!serverName || !toolName) {
          console.warn(`Invalid tool name format "${tool.name}", skipping`);
          continue;
        }

        parsedTools.push({
          serverName,
          toolName,
          description: tool.description || "",
          inputSchema: tool.inputSchema,
        });
      }

      if (parsedTools.length === 0) {
        return {
          success: true as const,
          message: "No valid tools to refresh after parsing",
          toolsCreated: 0,
          mappingsCreated: 0,
        };
      }

      // Get servers associated with this namespace first
      const namespaceWithServers =
        await namespacesRepository.findByUuidWithServers(input.namespaceUuid);

      if (!namespaceWithServers) {
        return {
          success: false as const,
          message: "Namespace not found",
        };
      }

      // Create a map of server names to server data for quick lookup
      const namespaceServersMap = new Map<string, typeof namespaceWithServers.servers[0]>();
      for (const server of namespaceWithServers.servers) {
        namespaceServersMap.set(server.name, server);
      }

      // Log available servers for debugging
      console.log(
        `[refreshTools] Namespace "${input.namespaceUuid}" has ${namespaceWithServers.servers.length} server(s):`,
        namespaceWithServers.servers.map((s) => s.name).join(", "),
      );
      console.log(
        `[refreshTools] Parsed ${parsedTools.length} tool(s) from input:`,
        parsedTools.map((t) => `${t.serverName}__${t.toolName}`).join(", "),
      );

      // Group tools by server name and resolve server UUIDs
      const toolsByServerName: Record<
        string,
        {
          serverUuid: string;
          tools: Array<{
            toolName: string;
            description: string;
            inputSchema: Record<string, unknown>;
          }>;
        }
      > = {};

      for (const parsedTool of parsedTools) {
        // Find server by name in the namespace's servers
        let server = namespaceServersMap.get(parsedTool.serverName);

        // If exact match fails, try to handle nested MetaMCP scenarios
        // For nested MetaMCP, tool names may be in format "ParentServer__ChildServer__tool"
        // but we need to find the actual "ParentServer" in the namespace
        if (!server && parsedTool.serverName.includes("__")) {
          // Try the first part before the first "__" (this would be the actual server)
          const firstDoubleUnderscoreIndex =
            parsedTool.serverName.indexOf("__");
          const actualServerName = parsedTool.serverName.substring(
            0,
            firstDoubleUnderscoreIndex,
          );

          server = namespaceServersMap.get(actualServerName);

          if (server) {
            console.log(
              `Found nested MetaMCP server mapping: "${parsedTool.serverName}" -> "${actualServerName}"`,
            );
            // Update the parsed tool to use the correct server name and adjust tool name
            const remainingPart = parsedTool.serverName.substring(
              firstDoubleUnderscoreIndex + 2,
            );
            parsedTool.toolName = `${remainingPart}__${parsedTool.toolName}`;
            parsedTool.serverName = actualServerName;
          }
        }

        if (!server) {
          console.warn(
            `[refreshTools] Server "${parsedTool.serverName}" not found in namespace "${input.namespaceUuid}". Available servers: ${Array.from(namespaceServersMap.keys()).join(", ")}. Skipping tool "${parsedTool.toolName}"`,
          );
          continue;
        }

        if (!toolsByServerName[parsedTool.serverName]) {
          toolsByServerName[parsedTool.serverName] = {
            serverUuid: server.uuid,
            tools: [],
          };
        }

        toolsByServerName[parsedTool.serverName].tools.push({
          toolName: parsedTool.toolName,
          description: parsedTool.description,
          inputSchema: parsedTool.inputSchema,
        });
      }

      if (Object.keys(toolsByServerName).length === 0) {
        return {
          success: false as const,
          message: "No servers found for the provided tools",
        };
      }

      let totalToolsCreated = 0;
      let totalMappingsCreated = 0;

      // Process tools for each server
      for (const [serverName, serverData] of Object.entries(
        toolsByServerName,
      )) {
        const { serverUuid, tools } = serverData;

        // Bulk upsert tools to the tools table with the actual tool names
        const upsertedTools = await toolsRepository.bulkUpsert({
          mcpServerUuid: serverUuid,
          tools: tools.map((tool) => ({
            name: tool.toolName, // Use the actual tool name, not the prefixed name
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });

        totalToolsCreated += upsertedTools.length;

        // Create namespace tool mappings
        const toolMappings = upsertedTools.map((tool) => ({
          toolUuid: tool.uuid,
          serverUuid: serverUuid,
          status: "ACTIVE" as const,
        }));

        const createdMappings =
          await namespaceMappingsRepository.bulkUpsertNamespaceToolMappings({
            namespaceUuid: input.namespaceUuid,
            toolMappings,
          });

        totalMappingsCreated += createdMappings.length;

        console.log(
          `Processed ${tools.length} tools for server "${serverName}" (${serverUuid})`,
        );
      }

      // Invalidate idle MetaMCP server for this namespace since tools were refreshed
      // Run this asynchronously to avoid blocking the response
      metaMcpServerPool
        .invalidateIdleServer(input.namespaceUuid)
        .then(() => {
          console.log(
            `Invalidated idle MetaMCP server for namespace ${input.namespaceUuid} after tools refresh`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating idle MetaMCP server for namespace ${input.namespaceUuid}:`,
            error,
          );
          // Don't fail the entire operation if idle server invalidation fails
        });

      // Also invalidate OpenAPI sessions for this namespace
      metaMcpServerPool
        .invalidateOpenApiSessions([input.namespaceUuid])
        .then(() => {
          console.log(
            `Invalidated OpenAPI session for namespace ${input.namespaceUuid} after tools refresh`,
          );
        })
        .catch((error) => {
          console.error(
            `Error invalidating OpenAPI session for namespace ${input.namespaceUuid}:`,
            error,
          );
          // Don't fail the entire operation if OpenAPI session invalidation fails
        });

      return {
        success: true as const,
        message: `Successfully refreshed ${totalToolsCreated} tools with ${totalMappingsCreated} mappings`,
        toolsCreated: totalToolsCreated,
        mappingsCreated: totalMappingsCreated,
      };
    } catch (error) {
      console.error("Error refreshing namespace tools:", error);
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : "Internal server error",
      };
    }
  },
};
