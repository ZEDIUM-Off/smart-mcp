"use client";

import {
  McpServer,
  EndpointWithNamespace,
  LiveConnectionsByEndpoint,
} from "@repo/zod-types";
import type { CreateTRPCReact } from "@trpc/react-query";
import { createAppRouter } from "@repo/trpc";
import { Server, Link as LinkIcon, Activity, AlertCircle } from "lucide-react";
import { use, useEffect } from "react";

import { usePageHeader } from "@/components/page-header-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "@/hooks/useTranslations";
import { trpc as trpcBase } from "@/lib/trpc";

type AppRouter = ReturnType<typeof createAppRouter>;
const trpc = trpcBase as unknown as CreateTRPCReact<AppRouter, unknown>;

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default function DashboardPage({ params }: DashboardPageProps) {
  const { locale: _locale } = use(params);
  const { t } = useTranslations();
  const { setHeader, clearHeader } = usePageHeader();

  useEffect(() => {
    setHeader({
      title: t("dashboard:title"),
      description: t("dashboard:description"),
      icon: <Activity className="h-5 w-5" />,
    });

    return () => clearHeader();
  }, [clearHeader, setHeader, t]);

  // Fetch dashboard stats
  const {
    data: statsResponse,
    isLoading,
    error,
  } = trpc.frontend.dashboard.getLiveStats.useQuery(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch MCP servers list for additional stats
  const { data: serversResponse } = trpc.frontend.mcpServers.list.useQuery();
  const { data: endpointsResponse } = trpc.frontend.endpoints.list.useQuery();

  const stats = statsResponse?.success ? statsResponse.data : null;
  const servers = serversResponse?.success ? serversResponse.data : [];
  const endpoints = endpointsResponse?.success ? endpointsResponse.data : [];

  // Calculate additional stats
  const totalServers = servers.length;
  const serversWithError = servers.filter(
    (s: McpServer) => s.error_status === "ERROR",
  ).length;
  const totalEndpoints = endpoints.length;
  const liveConnectionsTotal = stats?.liveConnections.total || 0;
  const liveConnectionsSSE = stats?.liveConnections.byTransport.SSE || 0;
  const liveConnectionsStreamableHTTP =
    stats?.liveConnections.byTransport.StreamableHTTP || 0;

  // Top endpoints by connections
  const topEndpoints = (stats?.liveConnections.byEndpoint ?? [])
    .slice(0, 10)
    .map((endpoint: LiveConnectionsByEndpoint) => {
      const endpointInfo = endpoints.find(
        (e: EndpointWithNamespace) => e.name === endpoint.endpointName,
      );
      return {
        ...endpoint,
        description: endpointInfo?.description || null,
      };
    }) || [];

  if (error) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="rounded-lg border border-dashed p-12 text-center">
            <div className="flex flex-col items-center justify-center mx-auto max-w-md">
              <AlertCircle className="size-12 text-red-400" />
              <h3 className="mt-4 text-lg font-semibold">
                {t("dashboard:errorLoadingTitle")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {error.message || t("dashboard:errorLoadingDescription")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Stats Cards */}
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {/* Total MCP Servers */}
        <Card className="@container/card" data-slot="card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard:totalServers")}
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalServers}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard:serversConfigured")}
            </p>
          </CardContent>
        </Card>

        {/* Servers with Errors */}
        <Card className="@container/card" data-slot="card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard:serversWithErrors")}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{serversWithError}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard:serversNeedingAttention")}
            </p>
          </CardContent>
        </Card>

        {/* Total Endpoints */}
        <Card className="@container/card" data-slot="card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard:totalEndpoints")}
            </CardTitle>
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalEndpoints}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard:endpointsConfigured")}
            </p>
          </CardContent>
        </Card>

        {/* Live Connections */}
        <Card className="@container/card" data-slot="card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard:liveConnections")}
            </CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{liveConnectionsTotal}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              SSE: {liveConnectionsSSE} • StreamableHTTP:{" "}
              {liveConnectionsStreamableHTTP}
            </p>
          </CardContent>
        </Card>
        </div>

        {/* Top Endpoints by Connections */}
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard:topEndpoints")}</CardTitle>
              <CardDescription>
                {t("dashboard:topEndpointsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : topEndpoints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("dashboard:noActiveConnections")}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common:name")}</TableHead>
                      <TableHead>{t("dashboard:namespace")}</TableHead>
                      <TableHead className="text-right">
                        {t("dashboard:totalConnections")}
                      </TableHead>
                      <TableHead className="text-right">SSE</TableHead>
                      <TableHead className="text-right">StreamableHTTP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topEndpoints.map((endpoint: typeof topEndpoints[0]) => (
                      <TableRow key={`${endpoint.endpointName}-${endpoint.namespaceUuid}`}>
                        <TableCell className="font-medium">
                          {endpoint.endpointName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {endpoint.namespaceUuid.slice(0, 8)}...
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {endpoint.count}
                        </TableCell>
                        <TableCell className="text-right">
                          {endpoint.byTransport.SSE}
                        </TableCell>
                        <TableCell className="text-right">
                          {endpoint.byTransport.StreamableHTTP}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pool Status (Debug/Operations) */}
        <div className="px-4 lg:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("dashboard:metaMcpPool")}</CardTitle>
                <CardDescription>{t("dashboard:metaMcpPoolDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("dashboard:idle")}:
                      </span>
                      <span className="font-medium">
                        {stats?.metaMcpPoolStatus.idle || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("dashboard:active")}:
                      </span>
                      <span className="font-medium">
                        {stats?.metaMcpPoolStatus.active || 0}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("dashboard:mcpServerPool")}</CardTitle>
                <CardDescription>
                  {t("dashboard:mcpServerPoolDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("dashboard:idle")}:
                      </span>
                      <span className="font-medium">
                        {stats?.mcpServerPoolStatus.idle || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("dashboard:active")}:
                      </span>
                      <span className="font-medium">
                        {stats?.mcpServerPoolStatus.active || 0}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

