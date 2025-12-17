import { eq, desc } from "drizzle-orm";
import { db } from "..";
import { packageInstallHistoryTable } from "../schema";

export const packageInstallerRepository = {
  create: async (input: {
    manager: string;
    package_name: string;
    command: string;
    output: string;
    status: "success" | "failure";
    user_id?: string | null;
  }) => {
    const [result] = await db
      .insert(packageInstallHistoryTable)
      .values({
        manager: input.manager,
        package_name: input.package_name,
        command: input.command,
        output: input.output,
        status: input.status,
        user_id: input.user_id,
      })
      .returning();
    return result;
  },

  findAll: async () => {
    return db
      .select()
      .from(packageInstallHistoryTable)
      .orderBy(desc(packageInstallHistoryTable.created_at));
  },
};
