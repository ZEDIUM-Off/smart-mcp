"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  InstallPackageRequestSchema,
  PackageManagerSchema,
} from "@repo/zod-types";
import { Loader2, Terminal } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type InstallPackageFormData = z.infer<typeof InstallPackageRequestSchema>;

export function PackageInstaller() {
  const [output, setOutput] = useState<string>("");
  const [isInstalling, setIsInstalling] = useState(false);

  const form = useForm<InstallPackageFormData>({
    resolver: zodResolver(InstallPackageRequestSchema),
    defaultValues: {
      manager: "npm",
      packageName: "",
    },
  });

  const utils = trpc.useUtils();

  const installMutation = trpc.frontend.packageInstaller.install.useMutation({
    onSuccess: (data) => {
      setOutput(data.output);
      if (data.success) {
        toast.success(data.message || "Package installed successfully");
        form.reset();
        utils.frontend.packageInstaller.listHistory.invalidate();
      } else {
        toast.error(data.message || "Package installation failed");
      }
      setIsInstalling(false);
    },
    onError: (error) => {
      setOutput(error.message);
      toast.error("Failed to install package");
      setIsInstalling(false);
    },
  });

  const { data: history, isLoading: historyLoading } =
    trpc.frontend.packageInstaller.listHistory.useQuery();

  const onSubmit = (data: InstallPackageFormData) => {
    setIsInstalling(true);
    setOutput(`Installing ${data.packageName} using ${data.manager}...\n`);
    installMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Install System Package</CardTitle>
          <CardDescription>
            Install packages required by your MCP servers. Supported managers:
            npm, apt, pip, uv.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-4">
              <div className="w-32">
                <Select
                  onValueChange={(value) =>
                    form.setValue("manager", value as any)
                  }
                  defaultValue={form.getValues("manager")}
                  disabled={isInstalling}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {PackageManagerSchema.options.map((manager) => (
                      <SelectItem key={manager} value={manager}>
                        {manager}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Package name (e.g. @modelcontextprotocol/server-filesystem)"
                  {...form.register("packageName")}
                  disabled={isInstalling}
                />
              </div>
              <Button type="submit" disabled={isInstalling}>
                {isInstalling && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Install
              </Button>
            </div>
          </form>

          {(output || isInstalling) && (
            <div className="mt-4 rounded-md bg-black p-4 font-mono text-sm text-white">
              <div className="flex items-center gap-2 border-b border-gray-700 pb-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span>Console Output</span>
                {isInstalling && (
                  <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                )}
              </div>
              <pre className="whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
                {output || "Installing package...\nWaiting for output..."}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Installation History</CardTitle>
          <CardDescription>
            Recent package installation attempts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-center py-4">Loading history...</div>
          ) : history?.data.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No installation history found.
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Time</th>
                    <th className="p-3 text-left font-medium">Manager</th>
                    <th className="p-3 text-left font-medium">Package</th>
                    <th className="p-3 text-left font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Command</th>
                  </tr>
                </thead>
                <tbody>
                  {history?.data.map((entry) => (
                    <tr key={entry.uuid} className="border-b last:border-0">
                      <td className="p-3">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">{entry.manager}</td>
                      <td className="p-3">{entry.package_name}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            entry.status === "success"
                              ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20"
                              : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {entry.command}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
