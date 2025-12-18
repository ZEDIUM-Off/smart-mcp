import type { AppRouter } from "@repo/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { type CreateTRPCReact, createTRPCReact } from "@trpc/react-query";

// Create the tRPC client
export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>();

// Create tRPC client with HTTP link configured for better-auth
export const reactTrpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc",
      // Include credentials (cookies) in requests for better-auth
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

export const vanillaTrpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      // Include credentials (cookies) in requests for better-auth
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});
