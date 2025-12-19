import { and, desc, eq } from "drizzle-orm";

import { db } from "../index";
import { namespaceAgentsTable } from "../schema";

export type NamespaceAgentType = "ask";

export interface NamespaceAgentCreateInput {
  namespace_uuid: string;
  name: string;
  agent_type?: NamespaceAgentType;
  enabled?: boolean;
  model?: string;
  system_prompt?: string;
  references?: Record<string, unknown>;
  allowed_tools?: string[];
  denied_tools?: string[];
  max_tool_calls?: number;
  expose_limit?: number;
}

export interface NamespaceAgentUpdateInput {
  uuid: string;
  name?: string;
  enabled?: boolean;
  model?: string;
  system_prompt?: string;
  references?: Record<string, unknown>;
  allowed_tools?: string[];
  denied_tools?: string[];
  max_tool_calls?: number;
  expose_limit?: number;
}

export const namespaceAgentsRepository = {
  /**
   * Back-compat helpers (pre multi-agent): keep legacy call sites working while we migrate.
   * - Previously there was a UNIQUE(namespace_uuid, agent_type) and callers used getByNamespaceAndType/upsert.
   * - Now there can be multiple agents per namespace; we treat "the most recently created" as the legacy target.
   */
  async getByNamespaceAndType(namespaceUuid: string, agentType: NamespaceAgentType) {
    return await this.getFirstByNamespaceAndType(namespaceUuid, agentType);
  },

  async upsert(input: {
    namespace_uuid: string;
    agent_type: NamespaceAgentType;
    name?: string;
    enabled?: boolean;
    model?: string;
    system_prompt?: string;
    references?: Record<string, unknown>;
    allowed_tools?: string[];
    denied_tools?: string[];
    max_tool_calls?: number;
    expose_limit?: number;
  }) {
    const existing = await this.getFirstByNamespaceAndType(
      input.namespace_uuid,
      input.agent_type,
    );
    if (!existing) {
      return await this.create({
        namespace_uuid: input.namespace_uuid,
        name: input.name ?? "Default Ask Agent",
        agent_type: input.agent_type,
        enabled: input.enabled,
        model: input.model,
        system_prompt: input.system_prompt,
        references: input.references,
        allowed_tools: input.allowed_tools,
        denied_tools: input.denied_tools,
        max_tool_calls: input.max_tool_calls,
        expose_limit: input.expose_limit,
      });
    }

    return await this.update({
      uuid: existing.uuid,
      name: input.name,
      enabled: input.enabled,
      model: input.model,
      system_prompt: input.system_prompt,
      references: input.references,
      allowed_tools: input.allowed_tools,
      denied_tools: input.denied_tools,
      max_tool_calls: input.max_tool_calls,
      expose_limit: input.expose_limit,
    });
  },

  async listByNamespace(namespaceUuid: string) {
    return await db
      .select()
      .from(namespaceAgentsTable)
      .where(eq(namespaceAgentsTable.namespace_uuid, namespaceUuid))
      .orderBy(desc(namespaceAgentsTable.created_at));
  },

  async getByUuid(uuid: string) {
    const [row] = await db
      .select()
      .from(namespaceAgentsTable)
      .where(eq(namespaceAgentsTable.uuid, uuid))
      .limit(1);
    return row;
  },

  async getFirstByNamespaceAndType(namespaceUuid: string, agentType: NamespaceAgentType) {
    const [row] = await db
      .select()
      .from(namespaceAgentsTable)
      .where(
        and(
          eq(namespaceAgentsTable.namespace_uuid, namespaceUuid),
          eq(namespaceAgentsTable.agent_type, agentType),
        ),
      )
      .orderBy(desc(namespaceAgentsTable.created_at))
      .limit(1);
    return row;
  },

  async create(input: NamespaceAgentCreateInput) {
    const now = new Date();
    const [row] = await db
      .insert(namespaceAgentsTable)
      .values({
        namespace_uuid: input.namespace_uuid,
        name: input.name,
        agent_type: input.agent_type ?? "ask",
        enabled: input.enabled ?? true,
        model: input.model ?? "gpt-4o-mini",
        system_prompt: input.system_prompt ?? "",
        references: input.references ?? {},
        allowed_tools: input.allowed_tools ?? [],
        denied_tools: input.denied_tools ?? [],
        max_tool_calls: input.max_tool_calls ?? 3,
        expose_limit: input.expose_limit ?? 5,
        updated_at: now,
      })
      .returning();
    return row;
  },

  async update(input: NamespaceAgentUpdateInput) {
    const now = new Date();
    const set: Record<string, unknown> = { updated_at: now };
    if (input.name !== undefined) set.name = input.name;
    if (input.enabled !== undefined) set.enabled = input.enabled;
    if (input.model !== undefined) set.model = input.model;
    if (input.system_prompt !== undefined) set.system_prompt = input.system_prompt;
    if (input.references !== undefined) set.references = input.references;
    if (input.allowed_tools !== undefined) set.allowed_tools = input.allowed_tools;
    if (input.denied_tools !== undefined) set.denied_tools = input.denied_tools;
    if (input.max_tool_calls !== undefined) set.max_tool_calls = input.max_tool_calls;
    if (input.expose_limit !== undefined) set.expose_limit = input.expose_limit;

    const [row] = await db
      .update(namespaceAgentsTable)
      .set(set)
      .where(eq(namespaceAgentsTable.uuid, input.uuid))
      .returning();
    return row;
  },

  async delete(uuid: string) {
    await db.delete(namespaceAgentsTable).where(eq(namespaceAgentsTable.uuid, uuid));
  },
};


