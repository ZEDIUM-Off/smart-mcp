"use client";

import { useEffect } from "react";

export function DebugConsoleHook() {
  useEffect(() => {
    const originalError = console.error;

    console.error = (...args: any[]) => {
      const shouldForward = () => {
        const first = args?.[0];
        const msg = typeof first === "string" ? first : "";
        // These warnings are typically caused by external React tree inspection
        // enumerating Next.js sync dynamic props (params/searchParams).
        if (
          msg.includes("nextjs.org/docs/messages/sync-dynamic-apis") ||
          msg.includes("params.locale") ||
          msg.includes("params are being enumerated") ||
          msg.includes("searchParams")
        ) {
          return false;
        }
        return true;
      };

      try {
        const first = args?.[0];
        const msg = typeof first === "string" ? first : "";
        if (
          msg.includes("changing an uncontrolled input to be controlled") ||
          msg.includes("params are being enumerated") ||
          msg.includes("searchParams") ||
          msg.includes("A param property was accessed directly")
        ) {
          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId: "pre-fix",
                hypothesisId: "E",
                location: "apps/frontend/components/debug-console-hook.tsx:console.error",
                message: "Intercepted console.error",
                data: {
                  msg,
                  stack: String(new Error().stack || "").slice(0, 1200),
                },
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
          // #endregion agent log
        }
      } catch {
        // ignore
      }
      if (shouldForward()) {
        originalError(...args);
      }
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}


