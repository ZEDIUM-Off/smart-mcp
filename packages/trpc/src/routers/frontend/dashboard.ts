import { DashboardStatsResponseSchema } from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

// Define the dashboard router with procedure definitions
// The actual implementation will be provided by the backend
export const createDashboardRouter = (
  // These are the implementation functions that the backend will provide
  implementations: {
    getLiveStats: (
      userId: string,
    ) => Promise<z.infer<typeof DashboardStatsResponseSchema>>;
  },
) => {
  return router({
    // Protected: Get live stats for dashboard
    getLiveStats: protectedProcedure
      .output(DashboardStatsResponseSchema)
      .query(async ({ ctx }) => {
        return await implementations.getLiveStats(ctx.user.id);
      }),
  });
};

