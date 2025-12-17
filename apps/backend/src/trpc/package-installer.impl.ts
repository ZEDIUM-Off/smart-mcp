import {
  InstallPackageRequestSchema,
  InstallPackageResponseSchema,
  ListPackageInstallHistoryResponseSchema,
} from "@repo/zod-types";
import { z } from "zod";
import { PackageInstaller, PackageManager } from "../lib/package-installer";
import { packageInstallerRepository } from "../db/repositories";

export const packageInstallerImplementations = {
  install: async (
    input: z.infer<typeof InstallPackageRequestSchema>,
    userId: string,
  ): Promise<z.infer<typeof InstallPackageResponseSchema>> => {
    try {
      console.log(
        "[PackageInstaller][tRPC] env ENABLE_PACKAGE_INSTALLER=",
        JSON.stringify(process.env.ENABLE_PACKAGE_INSTALLER),
      );
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C',location:'apps/backend/src/trpc/package-installer.impl.ts:install:entry',message:'tRPC packageInstaller.install called',data:{manager:input.manager,packageName:input.packageName,userIdPresent:Boolean(userId),ENABLE_PACKAGE_INSTALLER:String(process.env.ENABLE_PACKAGE_INSTALLER)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      const result = await PackageInstaller.install(
        input.manager as PackageManager,
        input.packageName,
      );

      // Log to history
      await packageInstallerRepository.create({
        manager: input.manager,
        package_name: input.packageName,
        command: result.command,
        output: result.output,
        status: result.success ? "success" : "failure",
        user_id: userId,
      });

      return {
        success: result.success,
        output: result.output,
        command: result.command,
        message: result.success
          ? "Package installed successfully"
          : "Package installation failed",
      };
    } catch (error) {
      console.error("Error installing package:", error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C',location:'apps/backend/src/trpc/package-installer.impl.ts:install:catch',message:'tRPC packageInstaller.install failed',data:{errorMessage:error instanceof Error?error.message:String(error),ENABLE_PACKAGE_INSTALLER:String(process.env.ENABLE_PACKAGE_INSTALLER)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        command: "",
        message: "Internal server error during installation",
      };
    }
  },

  listHistory: async (): Promise<
    z.infer<typeof ListPackageInstallHistoryResponseSchema>
  > => {
    try {
      const history = await packageInstallerRepository.findAll();
      
      // Map database results to schema format
      const mappedHistory = history.map((entry) => ({
        uuid: entry.uuid,
        manager: entry.manager,
        package_name: entry.package_name,
        command: entry.command,
        output: entry.output,
        status: entry.status,
        created_at: entry.created_at.toISOString(),
        user_id: entry.user_id,
      }));

      return {
        success: true,
        data: mappedHistory,
      };
    } catch (error) {
      console.error("Error fetching package install history:", error);
      return {
        success: false,
        data: [],
      };
    }
  },
};
