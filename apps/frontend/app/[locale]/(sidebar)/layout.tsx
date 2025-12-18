"use client";

import {
  Activity,
  FileTerminal,
  Key,
  Link as LinkIcon,
  Package,
  Search,
  SearchCode,
  Server,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LogsStatusIndicator } from "@/components/logs-status-indicator";
import { PageHeaderProvider, usePageHeader } from "@/components/page-header-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTranslations } from "@/hooks/useTranslations";
import { authClient } from "@/lib/auth-client";
import { getLocalizedPath, SupportedLocale } from "@/lib/i18n";

// Menu items function - now takes locale parameter
const getMenuItems = (t: (key: string) => string, locale: SupportedLocale) => [
  {
    title: t("navigation:dashboard"),
    url: getLocalizedPath("/dashboard", locale),
    icon: Activity,
  },
  {
    title: t("navigation:exploreMcpServers"),
    url: getLocalizedPath("/search", locale),
    icon: Search,
  },
  {
    title: t("navigation:mcpServers"),
    url: getLocalizedPath("/mcp-servers", locale),
    icon: Server,
  },
  {
    title: t("navigation:metamcpNamespaces"),
    url: getLocalizedPath("/namespaces", locale),
    icon: Package,
  },
  {
    title: t("navigation:metamcpEndpoints"),
    url: getLocalizedPath("/endpoints", locale),
    icon: LinkIcon,
  },
  {
    title: t("navigation:mcpInspector"),
    url: getLocalizedPath("/mcp-inspector", locale),
    icon: SearchCode,
  },
  {
    title: t("navigation:apiKeys"),
    url: getLocalizedPath("/api-keys", locale),
    icon: Key,
  },
  {
    title: t("navigation:settings"),
    url: getLocalizedPath("/settings", locale),
    icon: Settings,
  },
];

function LiveLogsMenuItem() {
  const { t, locale } = useTranslations();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link href={getLocalizedPath("/live-logs", locale)}>
          <FileTerminal />
          <span>{t("navigation:liveLogs")}</span>
          <LogsStatusIndicator />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserInfoFooter() {
  const { t } = useTranslations();
  const [user, setUser] = useState<{ name?: string | null; email?: string | null } | null>(null);

  // Get user info
  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setUser(session.data.user);
      }
    });
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarFooter>
      <div className="flex flex-col gap-4 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <p className="text-xs text-muted-foreground">v2.4.22</p>
        </div>
        <Separator />
        {user && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {user.name || user.email}
              </span>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="w-full"
            >
              {t("auth:signOut")}
            </Button>
          </div>
        )}
      </div>
    </SidebarFooter>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = useTranslations();
  const items = getMenuItems(t, locale);

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <SidebarWithHover variant="inset">
        <SidebarHeader className="flex flex-col justify-center items-center px-2 py-4">
          <div className="flex items-center justify-center w-full mb-2">
            <div className="flex items-center gap-4">
              <Image
                src="/favicon.ico"
                alt="MetaMCP Logo"
                width={256}
                height={256}
                className="h-12 w-12"
              />
              <h2 className="text-2xl font-semibold">MetaMCP</h2>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("navigation:application")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <LiveLogsMenuItem />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <UserInfoFooter />
      </SidebarWithHover>
      <SidebarInset>
        <PageHeaderProvider>
          <LayoutHeader />
          <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
        </PageHeaderProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarWithHover({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { isMobile, open, setOpen } = useSidebar();

  const [openedByHover, setOpenedByHover] = useState(false);
  const overSidebarRef = useRef(false);
  const overZoneRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleCloseIfNeeded = useCallback(() => {
    clearCloseTimer();
    if (isMobile) return;
    if (!openedByHover) return;
    closeTimerRef.current = setTimeout(() => {
      if (!overSidebarRef.current && !overZoneRef.current) {
        setOpen(false);
        setOpenedByHover(false);
      }
    }, 150);
  }, [clearCloseTimer, isMobile, openedByHover, setOpen]);

  const handleZoneEnter = useCallback(() => {
    if (isMobile) return;
    overZoneRef.current = true;
    clearCloseTimer();
    if (!open) {
      setOpen(true);
      setOpenedByHover(true);
    }
  }, [clearCloseTimer, isMobile, open, setOpen]);

  const handleZoneLeave = useCallback(() => {
    overZoneRef.current = false;
    scheduleCloseIfNeeded();
  }, [scheduleCloseIfNeeded]);

  const handleSidebarEnter = useCallback(() => {
    overSidebarRef.current = true;
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handleSidebarLeave = useCallback(() => {
    overSidebarRef.current = false;
    scheduleCloseIfNeeded();
  }, [scheduleCloseIfNeeded]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  return (
    <>
      {/* Desktop hover zone (20vw left edge) */}
      {!isMobile ? (
        <div
          className={[
            "fixed inset-y-0 left-0 z-20 hidden md:block",
            open ? "pointer-events-none w-0" : "w-[1vw]",
          ].join(" ")}
          onMouseEnter={handleZoneEnter}
          onMouseLeave={handleZoneLeave}
        />
      ) : null}

      <Sidebar
        {...props}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        {children}
      </Sidebar>
    </>
  );
}

function LayoutHeader() {
  const { header } = usePageHeader();

  return (
    <header className="flex h-[4rem] shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-[calc(var(--spacing)*12)]">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <div className="flex w-full items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {header.icon ? (
              <span className="text-primary [&>svg]:h-5 [&>svg]:w-5">
                {header.icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {header.title ? (
                <div className="text-base font-semibold leading-tight truncate">
                  {header.title}
                </div>
              ) : null}
              {header.description ? (
                <div className="text-sm text-muted-foreground leading-tight truncate">
                  {header.description}
                </div>
              ) : null}
            </div>
          </div>

          {header.actions ? (
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {header.actions}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
