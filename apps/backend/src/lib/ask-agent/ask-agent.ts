import type {
  AskAgentConfig,
  AskAgentContext,
  AskAgentPlan,
  AskAgentReport,
  AskAgentRunOptions,
  AskAgentToolCallExecuted,
  AskAgentToolCandidate,
  AskAgentTokenUsage,
  LlmAdapter,
  SessionToolExposer,
  ToolExecutor,
  ToolSearch,
} from "./types";
import { tokenCounter } from "../tokens/token-counter";

export class AskAgent {
  constructor(
    private readonly deps: {
      llm: LlmAdapter;
      search: ToolSearch;
      exec: ToolExecutor;
      expose: SessionToolExposer;
      // configurable limits to prevent huge context/tool output
      shortlistLimit?: number;
      maxToolOutputChars?: number;
    },
  ) {}

  async run(
    ctx: AskAgentContext,
    cfg: AskAgentConfig,
    opts: AskAgentRunOptions,
  ): Promise<{
    answer: string;
    toolCallsExecuted: AskAgentToolCallExecuted[];
    suggestedTools: AskAgentReport["suggestedTools"];
    exposedTools: string[];
    followups: string[];
    usage: string;
    tokenUsage: AskAgentTokenUsage;
  }> {
    if (!cfg.enabled) {
      return {
        answer: "Ask agent is disabled for this namespace.",
        toolCallsExecuted: [],
        suggestedTools: [],
        exposedTools: [],
        followups: [],
        usage: "Enable the ask agent in namespace settings to use it.",
      };
    }

    const maxToolCalls = Math.max(0, Math.min(opts.maxToolCalls, 20));
    const exposeLimit = Math.max(0, Math.min(opts.exposeLimit, 50));

    const denied = new Set(cfg.deniedTools || []);
    const allowlist = cfg.allowedTools || [];
    const isAllowed = (toolFullName: string): boolean => {
      if (denied.has(toolFullName)) return false;
      if (allowlist.length === 0) return true; // allow-all if not specified
      return allowlist.includes(toolFullName);
    };

    const shortlistLimit = this.deps.shortlistLimit ?? 12;
    const shortlist = await this.deps.search.search(
      ctx.namespaceUuid,
      opts.query,
      shortlistLimit,
    );

    const toolCandidates: AskAgentToolCandidate[] = shortlist.map((r) => ({
      name: r.tool.name,
      description: r.tool.description || "",
      inputSchema: (r.tool.inputSchema as Record<string, unknown>) || {},
      server: r.serverName,
      relevanceScore: Math.round(r.score * 100) / 100,
      allowed: isAllowed(r.tool.name),
    }));

    const systemPrompt =
      cfg.systemPrompt?.trim() ||
      "You are a specialized assistant for a tool namespace. Be concise, safe, and actionable.";

    // Token usage accounting (best-effort, same model encoder as OpenAI)
    const budget = 200_000;
    const parts: Record<string, number> = {};
    parts.systemPrompt = tokenCounter.count(cfg.model, systemPrompt);
    const toolsJson = JSON.stringify(toolCandidates);
    parts.toolCandidates = tokenCounter.count(cfg.model, toolsJson);
    const referencesJson = JSON.stringify(cfg.references ?? {});
    parts.references = tokenCounter.count(cfg.model, referencesJson);
    parts.query = tokenCounter.count(cfg.model, opts.query);

    // Approximation of the main user payload used for planning; keeps accounting stable
    const planningPayload = JSON.stringify(
      {
        query: opts.query,
        namespace: { uuid: ctx.namespaceUuid, description: ctx.namespaceDescription ?? null },
        constraints: { maxToolCalls, exposeLimit, allowlistProvided: allowlist.length > 0 },
        tools: toolCandidates,
        references: cfg.references ?? {},
      },
      null,
      2,
    );
    parts.planningPayload = tokenCounter.count(cfg.model, planningPayload);

    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    const tokenUsage: AskAgentTokenUsage = {
      model: cfg.model,
      budget,
      total,
      parts,
    };

    if (total > budget) {
      return {
        answer:
          `Token budget exceeded before execution: ${total}/${budget}. Reduce prompt/docs/tools context.`,
        toolCallsExecuted: [],
        suggestedTools: [],
        exposedTools: [],
        followups: [],
        usage:
          "Reduce the agent context (prompt/docs) or lower discovery/tool payload size, then retry.",
        tokenUsage,
      };
    }

    const plan = await this.deps.llm.chatJson<AskAgentPlan>({
      model: cfg.model,
      system: systemPrompt,
      user: JSON.stringify(
        {
          query: opts.query,
          namespace: {
            uuid: ctx.namespaceUuid,
            description: ctx.namespaceDescription ?? null,
          },
          constraints: {
            maxToolCalls,
            exposeLimit,
            allowlistProvided: allowlist.length > 0,
          },
          tools: toolCandidates,
          references: cfg.references ?? {},
        },
        null,
        2,
      ),
    });

    const requestedToolCalls = (plan.toolCalls ?? [])
      .filter((tc) => tc?.name && typeof tc.name === "string")
      .slice(0, maxToolCalls);

    const toolCallsExecuted: AskAgentToolCallExecuted[] = [];

    const maxToolOutputChars = this.deps.maxToolOutputChars ?? 6000;
    const truncate = (raw: string): string =>
      raw.length > maxToolOutputChars
        ? raw.slice(0, maxToolOutputChars) + "\n…(truncated)"
        : raw;

    const stringify = (result: unknown): string => {
      if (typeof result === "string") return truncate(result);
      try {
        return truncate(JSON.stringify(result));
      } catch {
        return truncate(String(result));
      }
    };

    for (const tc of requestedToolCalls) {
      const fullName = tc.name;

      // prevent recursion into synthetic tools
      if (fullName === "metamcp__ask" || fullName === "metamcp__find") {
        toolCallsExecuted.push({
          name: fullName,
          ok: false,
          reason: "Refusing recursive call to synthetic tool",
        });
        continue;
      }

      if (!isAllowed(fullName)) {
        toolCallsExecuted.push({
          name: fullName,
          ok: false,
          reason: "Tool not allowed by agent configuration",
        });
        continue;
      }

      try {
        const res = await this.deps.exec.callTool(
          fullName,
          tc.arguments ?? {},
        );
        toolCallsExecuted.push({
          name: fullName,
          ok: true,
          output: stringify(res),
        });
      } catch (err) {
        toolCallsExecuted.push({
          name: fullName,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const report = await this.deps.llm.chatJson<AskAgentReport>({
      model: cfg.model,
      system: systemPrompt,
      user: JSON.stringify(
        {
          query: opts.query,
          namespace: {
            uuid: ctx.namespaceUuid,
            description: ctx.namespaceDescription ?? null,
          },
          shortlist: toolCandidates,
          plan,
          toolCallsExecuted,
          references: cfg.references ?? {},
          outputFormat: "Return JSON only.",
        },
        null,
        2,
      ),
    });

    const exposeTools = (report.exposeTools ?? plan.exposeTools ?? [])
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .filter((n) => n !== "metamcp__ask" && n !== "metamcp__find")
      .filter((n) => isAllowed(n))
      .slice(0, exposeLimit);

    if (exposeTools.length > 0) {
      this.deps.expose.setExposedTools(ctx.sessionId, ctx.namespaceUuid, exposeTools);
    }

    return {
      answer: report.answer ?? plan.directAnswer ?? "",
      toolCallsExecuted,
      suggestedTools: report.suggestedTools ?? [],
      exposedTools: exposeTools,
      followups: report.followups ?? plan.followups ?? [],
      usage:
        "Any `exposedTools` have been added to your session. Call them directly by name.",
      tokenUsage,
    };
  }
}


