"use client";

import { CreateNamespaceAgentRequest, Namespace, NamespaceAgent } from "@repo/zod-types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "@/hooks/useTranslations";
import { getLocalizedPath } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export default function AgentsPage() {
  const { t, locale } = useTranslations();
  const utils = trpc.useUtils();

  const [namespaceUuid, setNamespaceUuid] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("Default Ask Agent");

  const { data: namespacesResp } = trpc.frontend.namespaces.list.useQuery();
  const namespaces = namespacesResp?.success ? namespacesResp.data : [];

  const effectiveNamespaceUuid = useMemo(() => {
    if (namespaceUuid) return namespaceUuid;
    return namespaces?.[0]?.uuid ?? "";
  }, [namespaceUuid, namespaces]);

  const { data: agentsResp } = trpc.frontend.namespaces.listAgents.useQuery(
    { namespaceUuid: effectiveNamespaceUuid },
    { enabled: !!effectiveNamespaceUuid },
  );
  const agents = agentsResp?.success ? agentsResp.data ?? [] : [];

  const createAgentMutation = trpc.frontend.namespaces.createAgent.useMutation({
    onSuccess: async (res) => {
      if (res.success) {
        toast.success(t("agents:created") ?? "Agent created");
        await utils.frontend.namespaces.listAgents.invalidate({ namespaceUuid: effectiveNamespaceUuid });
        setCreateOpen(false);
      } else {
        toast.error(res.message || (t("agents:createFailed") ?? "Failed to create agent"));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const agentUrl = (agent: NamespaceAgent) =>
    getLocalizedPath(`/agents/${agent.uuid}`, locale);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("agents:title") ?? "Agents"}</h1>
          <p className="text-sm text-muted-foreground">
            {t("agents:subtitle") ?? "Configure ask agents per namespace and test them in a playground."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!effectiveNamespaceUuid}>
          {t("agents:create") ?? "Create Agent"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("agents:namespace") ?? "Namespace"}</CardTitle>
          <CardDescription>
            {t("agents:namespaceHelp") ?? "Agents are scoped to one namespace."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select value={effectiveNamespaceUuid} onValueChange={setNamespaceUuid}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("agents:selectNamespace") ?? "Select a namespace"} />
            </SelectTrigger>
            <SelectContent>
              {namespaces.map((ns: Namespace) => (
                <SelectItem key={ns.uuid} value={ns.uuid}>
                  {ns.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent: NamespaceAgent) => (
          <Card key={agent.uuid} className="flex flex-col">
            <CardHeader>
              <CardTitle className="truncate">{agent.name}</CardTitle>
              <CardDescription className="truncate">
                {agent.model} • {agent.enabled ? "enabled" : "disabled"}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild variant="outline" className="w-full">
                <Link href={agentUrl(agent)}>{t("agents:open") ?? "Open"}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("agents:createTitle") ?? "Create Agent"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t("agents:fieldNamespace") ?? "Namespace"}</Label>
              <Select value={effectiveNamespaceUuid} onValueChange={setNamespaceUuid}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("agents:selectNamespace") ?? "Select a namespace"} />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map((ns: Namespace) => (
                    <SelectItem key={ns.uuid} value={ns.uuid}>
                      {ns.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-name">{t("agents:fieldName") ?? "Name"}</Label>
              <Input
                id="agent-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Default Ask Agent"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const payload: CreateNamespaceAgentRequest = {
                  namespaceUuid: effectiveNamespaceUuid,
                  name: newName.trim() || "Default Ask Agent",
                };
                createAgentMutation.mutate(payload);
              }}
              disabled={!effectiveNamespaceUuid || createAgentMutation.isPending}
            >
              {t("agents:create") ?? "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


