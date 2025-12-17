import { z } from "zod";

export const PackageManagerSchema = z.enum(["npm", "apt", "pip", "uv"]);

export const InstallPackageRequestSchema = z.object({
  manager: PackageManagerSchema,
  packageName: z.string().min(1),
});

export const InstallPackageResponseSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  command: z.string(),
  message: z.string().optional(),
});

export const PackageInstallHistorySchema = z.object({
  uuid: z.string(),
  manager: z.string(),
  package_name: z.string(),
  command: z.string(),
  output: z.string().nullable(),
  status: z.string(),
  created_at: z.string(), // ISO string
  user_id: z.string().nullable(),
});

export const ListPackageInstallHistoryResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(PackageInstallHistorySchema),
});
