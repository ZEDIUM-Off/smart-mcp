import {
  InstallPackageRequestSchema,
  InstallPackageResponseSchema,
  ListPackageInstallHistoryResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";

export const createPackageInstallerRouter = (implementations: {
  install: (
    input: z.infer<typeof InstallPackageRequestSchema>,
    userId: string,
  ) => Promise<z.infer<typeof InstallPackageResponseSchema>>;
  listHistory: () => Promise<z.infer<typeof ListPackageInstallHistoryResponseSchema>>;
}) => {
  return router({
    install: protectedProcedure
      .input(InstallPackageRequestSchema)
      .output(InstallPackageResponseSchema)
      .mutation(async ({ input, ctx }) => {
        return implementations.install(input, ctx.user.id);
      }),

    listHistory: protectedProcedure
      .output(ListPackageInstallHistoryResponseSchema)
      .query(async () => {
        return implementations.listHistory();
      }),
  });
};
