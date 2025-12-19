import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { namespaceAgentDocumentsTable } from "../schema";
import { tokenCounter } from "../../lib/tokens/token-counter";

export const namespaceAgentDocumentsRepository = {
  async getByUuid(docUuid: string) {
    const [row] = await db
      .select()
      .from(namespaceAgentDocumentsTable)
      .where(eq(namespaceAgentDocumentsTable.uuid, docUuid))
      .limit(1);
    return row;
  },

  async listByAgent(agentUuid: string) {
    return await db
      .select()
      .from(namespaceAgentDocumentsTable)
      .where(eq(namespaceAgentDocumentsTable.agent_uuid, agentUuid))
      .orderBy(desc(namespaceAgentDocumentsTable.created_at));
  },

  async addDoc(input: {
    agent_uuid: string;
    filename: string;
    mime?: string;
    content: string;
    token_model?: string;
  }) {
    const now = new Date();
    const model = input.token_model ?? "gpt-4o-mini";
    const token_count = tokenCounter.count(model, input.content);
    const [row] = await db
      .insert(namespaceAgentDocumentsTable)
      .values({
        agent_uuid: input.agent_uuid,
        filename: input.filename,
        mime: input.mime ?? "text/plain",
        token_count,
        content: input.content,
        updated_at: now,
      })
      .returning();
    return row;
  },

  async delete(docUuid: string) {
    await db
      .delete(namespaceAgentDocumentsTable)
      .where(eq(namespaceAgentDocumentsTable.uuid, docUuid));
  },
};


