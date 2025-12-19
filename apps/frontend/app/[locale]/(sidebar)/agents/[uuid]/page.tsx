"use client";

import { NamespaceAgent, NamespaceAgentDocument, UpdateNamespaceAgentRequest } from "@repo/zod-types";
import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ClientRequest,
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServerTypeEnum } from "@repo/zod-types";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConnection } from "@/hooks/useConnection";
import { useTranslations } from "@/hooks/useTranslations";
import { trpc } from "@/lib/trpc";

function safeParseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AgentDetailPage() {
  const { t } = useTranslations();
  const params = useParams<{ uuid: string }>();
  const agentUuid = params.uuid;
  const utils = trpc.useUtils();

  const [query, setQuery] = useState("");
  const [maxToolCalls, setMaxToolCalls] = useState<number>(2);
  const [exposeLimit, setExposeLimit] = useState<number>(5);
  const [askResult, setAskResult] = useState<string>("");
  const [toolsBefore, setToolsBefore] = useState<string[]>([]);
  const [toolsAfter, setToolsAfter] = useState<string[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any>(null);

  const { data: agentResp, isLoading: agentLoading } =
    trpc.frontend.namespaces.getAgent.useQuery({ agentUuid }, { enabled: !!agentUuid });
  const agent: NamespaceAgent | undefined = agentResp?.success ? agentResp.data : undefined;
  const namespaceUuid = agent?.namespace_uuid ?? "";

  const updateAgentMutation = trpc.frontend.namespaces.updateAgent.useMutation({
    onSuccess: async (res) => {
      if (res.success) {
        toast.success(t("agents:saved") ?? "Saved");
        await utils.frontend.namespaces.getAgent.invalidate({ agentUuid });
        if (namespaceUuid) {
          await utils.frontend.namespaces.listAgents.invalidate({ namespaceUuid });
        }
      } else {
        toast.error(res.message || (t("agents:saveFailed") ?? "Save failed"));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: docsResp } = trpc.frontend.namespaces.listAgentDocuments.useQuery(
    { agentUuid },
    { enabled: !!agentUuid && !!agent },
  );
  const docs: NamespaceAgentDocument[] = docsResp?.success ? docsResp.data ?? [] : [];

  const uploadDocMutation = trpc.frontend.namespaces.uploadAgentDocument.useMutation({
    onSuccess: async (res) => {
      if (res.success) {
        toast.success(t("agents:docUploaded") ?? "Document uploaded");
        await utils.frontend.namespaces.listAgentDocuments.invalidate({ agentUuid });
      } else {
        toast.error(res.message || "Upload failed");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDocMutation = trpc.frontend.namespaces.deleteAgentDocument.useMutation({
    onSuccess: async (res) => {
      if (res.success) {
        toast.success(t("agents:docDeleted") ?? "Document deleted");
        await utils.frontend.namespaces.listAgentDocuments.invalidate({ agentUuid });
      } else {
        toast.error(res.message || "Delete failed");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const connection = useConnection({
    mcpServerUuid: namespaceUuid || "unknown-namespace",
    transportType: McpServerTypeEnum.Enum.SSE,
    command: "",
    args: "",
    url: namespaceUuid ? `/mcp-proxy/metamcp/${namespaceUuid}/sse` : "",
    env: {},
    bearerToken: undefined,
    isMetaMCP: true,
    includeInactiveServers: true,
    enabled: Boolean(namespaceUuid),
  });

  const makeRequest = async <T extends z.ZodType>(
    request: ClientRequest,
    schema: T,
    options?: RequestOptions & { suppressToast?: boolean },
  ): Promise<z.output<T>> => {
    if (!connection?.makeRequest) {
      throw new Error("MCP client not ready");
    }
    return await (connection as any).makeRequest(request, schema, options);
  };

  if (!agent) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{t("agents:detail") ?? "Agent"}</h1>
        <p className="text-sm text-muted-foreground">
          {agentLoading
            ? (t("common:loading") ?? "Loading…")
            : (agentResp?.message ?? (t("agents:notFound") ?? "Agent not found"))}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">
            {agent.model} • {agent.enabled ? "enabled" : "disabled"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">{t("agents:settings") ?? "Settings"}</TabsTrigger>
          <TabsTrigger value="docs">{t("agents:docs") ?? "Docs"}</TabsTrigger>
          <TabsTrigger value="playground">{t("agents:playground") ?? "Playground"}</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>{t("agents:contextEngineering") ?? "Context engineering"}</CardTitle>
              <CardDescription>
                {t("agents:contextEngineeringHelp") ??
                  "Prompt, model, and tool execution policy for metamcp__ask."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{t("agents:enabled") ?? "Enabled"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("agents:enabledHelp") ?? "Disable to prevent usage."}
                  </div>
                </div>
                <Switch
                  checked={agent.enabled}
                  onCheckedChange={(checked) => {
                    const payload: UpdateNamespaceAgentRequest = {
                      agentUuid,
                      enabled: checked,
                    };
                    updateAgentMutation.mutate(payload);
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label>{t("agents:model") ?? "Model"}</Label>
                <Input
                  defaultValue={agent.model}
                  onBlur={(e) => {
                    const payload: UpdateNamespaceAgentRequest = {
                      agentUuid,
                      model: e.target.value.trim() || "gpt-4o-mini",
                    };
                    updateAgentMutation.mutate(payload);
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label>{t("agents:systemPrompt") ?? "System prompt"}</Label>
                <Textarea
                  defaultValue={agent.system_prompt}
                  rows={10}
                  onBlur={(e) => {
                    const payload: UpdateNamespaceAgentRequest = {
                      agentUuid,
                      system_prompt: e.target.value,
                    };
                    updateAgentMutation.mutate(payload);
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label>
                  {t("agents:deniedTools") ??
                    "Denied tools (one per line; empty = allow all)"}
                </Label>
                <Textarea
                  defaultValue={(agent.denied_tools || []).join("\n")}
                  rows={6}
                  onBlur={(e) => {
                    const payload: UpdateNamespaceAgentRequest = {
                      agentUuid,
                      denied_tools: safeParseLines(e.target.value),
                    };
                    updateAgentMutation.mutate(payload);
                  }}
                  placeholder="Server__toolName"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle>{t("agents:ragDocs") ?? "RAG docs"}</CardTitle>
              <CardDescription>
                {t("agents:ragDocsHelp") ??
                  "Upload .md/.txt as plain text (stored in DB for MVP)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const content = await file.text();
                  uploadDocMutation.mutate({
                    agentUuid,
                    filename: file.name,
                    mime: file.type || "text/plain",
                    content,
                  });
                  e.target.value = "";
                }}
              />

              <div className="grid gap-3">
                {docs.map((d) => (
                  <Card key={d.uuid}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">{d.filename}</CardTitle>
                      <CardDescription className="text-xs">
                        {d.mime} • {d.token_count} tokens
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                      <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs">
                        {d.content}
                      </pre>
                      <Button
                        variant="destructive"
                        onClick={() => deleteDocMutation.mutate({ docUuid: d.uuid })}
                        disabled={deleteDocMutation.isPending}
                      >
                        {t("agents:deleteDoc") ?? "Delete"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="playground">
          <Card>
            <CardHeader>
              <CardTitle>{t("agents:askPlayground") ?? "Ask playground"}</CardTitle>
              <CardDescription>
                {t("agents:askPlaygroundHelp") ??
                  "Run metamcp__ask and inspect tool calls + exposed tools."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="text-xs text-muted-foreground">
                Namespace: <span className="font-mono">{namespaceUuid}</span> • Connection:{" "}
                {connection.connectionStatus}
              </div>
              <div className="grid gap-2">
                <Label>{t("agents:query") ?? "Query"}</Label>
                <Textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>{t("agents:maxToolCalls") ?? "Max tool calls"}</Label>
                  <Input
                    type="number"
                    value={maxToolCalls}
                    onChange={(e) => setMaxToolCalls(Number(e.target.value))}
                    min={0}
                    max={20}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("agents:exposeLimit") ?? "Expose limit"}</Label>
                  <Input
                    type="number"
                    value={exposeLimit}
                    onChange={(e) => setExposeLimit(Number(e.target.value))}
                    min={0}
                    max={50}
                  />
                </div>
              </div>
              <Button
                onClick={async () => {
                  try {
                    setAskResult("");
                    // tools/list before
                    const before = await makeRequest(
                      { method: "tools/list" as const, params: {} },
                      ListToolsResultSchema,
                      { suppressToast: true },
                    );
                    setToolsBefore((before.tools || []).map((t) => t.name));

                    const res = await makeRequest(
                      {
                        method: "tools/call" as const,
                        params: {
                          name: "metamcp__ask",
                          arguments: { query, maxToolCalls, exposeLimit },
                        },
                      },
                      CompatibilityCallToolResultSchema,
                      { suppressToast: true },
                    );
                    setAskResult(JSON.stringify(res, null, 2));
                    try {
                      const txt = (res as any)?.content?.[0]?.text;
                      if (typeof txt === "string") {
                        const parsed = JSON.parse(txt);
                        setTokenUsage(parsed?.tokenUsage ?? null);
                      } else {
                        setTokenUsage(null);
                      }
                    } catch {
                      setTokenUsage(null);
                    }

                    // tools/list after
                    const after = await makeRequest(
                      { method: "tools/list" as const, params: {} },
                      ListToolsResultSchema,
                      { suppressToast: true },
                    );
                    setToolsAfter((after.tools || []).map((t) => t.name));
                  } catch (e) {
                    setAskResult(e instanceof Error ? e.message : String(e));
                  }
                }}
                disabled={!query.trim() || connection.connectionStatus !== "connected"}
              >
                {t("agents:runAsk") ?? "Run ask"}
              </Button>

              <div className="grid gap-2">
                <Label>{t("agents:toolsBeforeAfter") ?? "Tools before / after"}</Label>
                <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {JSON.stringify(
                    {
                      beforeCount: toolsBefore.length,
                      afterCount: toolsAfter.length,
                      newlyExposed: toolsAfter.filter((n) => !toolsBefore.includes(n)),
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>

              <div className="grid gap-2">
                <Label>{t("agents:tokenUsage") ?? "Token usage"}</Label>
                <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {tokenUsage ? JSON.stringify(tokenUsage, null, 2) : "(no token usage yet)"}
                </pre>
              </div>

              <div className="grid gap-2">
                <Label>{t("agents:result") ?? "Result"}</Label>
                <pre className="max-h-[500px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {askResult || "(no output yet)"}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


