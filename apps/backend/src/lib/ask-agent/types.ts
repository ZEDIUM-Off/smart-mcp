import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface AskAgentToolCandidate {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  server?: string;
  relevanceScore?: number;
  allowed: boolean;
}

export interface AskAgentPlan {
  directAnswer?: string;
  toolCalls?: Array<{
    name: string;
    arguments?: Record<string, unknown>;
    reason?: string;
  }>;
  exposeTools?: string[];
  followups?: string[];
}

export interface AskAgentReport {
  answer: string;
  suggestedTools?: Array<{
    name: string;
    why: string;
    exampleCall?: string;
  }>;
  exposeTools?: string[];
  followups?: string[];
  plan?: string;
}

export interface AskAgentTokenUsage {
  model: string;
  budget: number;
  total: number;
  parts: Record<string, number>;
}

export interface AskAgentToolCallExecuted {
  name: string;
  ok: boolean;
  reason?: string;
  output?: string;
  error?: string;
}

export interface AskAgentRunOptions {
  query: string;
  maxToolCalls: number;
  exposeLimit: number;
}

export interface AskAgentConfig {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  references: Record<string, unknown>;
  allowedTools: string[];
  deniedTools: string[];
  maxToolCalls: number;
  exposeLimit: number;
}

export interface AskAgentContext {
  namespaceUuid: string;
  sessionId: string;
  // Optional additional namespace context text shown to the agent
  namespaceDescription?: string | null;
}

export interface LlmAdapter {
  chatJson<T>(params: { model: string; system: string; user: string }): Promise<T>;
}

export interface ToolSearch {
  search(namespaceUuid: string, query: string, limit: number): Promise<
    Array<{
      tool: Tool;
      serverName: string;
      score: number;
    }>
  >;
}

export interface ToolExecutor {
  callTool(fullToolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface SessionToolExposer {
  setExposedTools(sessionId: string, namespaceUuid: string, toolNames: string[]): void;
}


