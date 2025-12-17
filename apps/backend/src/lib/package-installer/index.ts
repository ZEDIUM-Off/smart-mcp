import { spawn } from "child_process";

export type PackageManager = "npm" | "apt" | "pip" | "uv";

export interface InstallResult {
  success: boolean;
  output: string;
  command: string;
}

const ALLOWED_MANAGERS: PackageManager[] = ["npm", "apt", "pip", "uv"];

export class PackageInstaller {
  private static isEnabled(): boolean {
    // Extra runtime evidence (docker-friendly): show exact value in server logs
    // Note: does not include secrets.
    console.log(
      "[PackageInstaller] ENABLE_PACKAGE_INSTALLER=",
      JSON.stringify(process.env.ENABLE_PACKAGE_INSTALLER),
      "type=",
      typeof process.env.ENABLE_PACKAGE_INSTALLER,
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A',location:'apps/backend/src/lib/package-installer/index.ts:isEnabled',message:'Check ENABLE_PACKAGE_INSTALLER in process.env',data:{ENABLE_PACKAGE_INSTALLER:String(process.env.ENABLE_PACKAGE_INSTALLER),rawType:typeof process.env.ENABLE_PACKAGE_INSTALLER},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    return process.env.ENABLE_PACKAGE_INSTALLER === "true";
  }

  private static validatePackageName(name: string): boolean {
    // Allow alphanumeric, hyphens, underscores, @, /, and dots
    // This covers npm scoped packages (@scope/pkg), pip packages, apt packages
    return /^[a-zA-Z0-9@\/._-]+$/.test(name);
  }

  private static getCommand(manager: PackageManager, packageName: string): { cmd: string; args: string[] } {
    switch (manager) {
      case "npm":
        return { cmd: "npm", args: ["install", "-g", packageName] };
      case "apt":
        // apt-get is generally better for scripts than apt
        // -y for automatic yes to prompts
        return { cmd: "apt-get", args: ["install", "-y", packageName] };
      case "pip":
        return { cmd: "pip", args: ["install", packageName] };
      case "uv":
        return { cmd: "uv", args: ["pip", "install", packageName] };
      default:
        throw new Error(`Unknown package manager: ${manager}`);
    }
  }

  static async install(manager: PackageManager, packageName: string): Promise<InstallResult> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A',location:'apps/backend/src/lib/package-installer/index.ts:install:entry',message:'Install called',data:{manager,packageName,enabledComputed:process.env.ENABLE_PACKAGE_INSTALLER==="true",ENABLE_PACKAGE_INSTALLER:String(process.env.ENABLE_PACKAGE_INSTALLER)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    if (!this.isEnabled()) {
      throw new Error("Package installer is disabled. Set ENABLE_PACKAGE_INSTALLER=true to enable.");
    }

    if (!ALLOWED_MANAGERS.includes(manager)) {
      throw new Error(`Package manager '${manager}' is not allowed.`);
    }

    if (!this.validatePackageName(packageName)) {
      throw new Error("Invalid package name. Only alphanumeric characters, @, /, ., -, and _ are allowed.");
    }

    const { cmd, args } = this.getCommand(manager, packageName);
    const fullCommand = `${cmd} ${args.join(" ")}`;

    console.log(`[PackageInstaller] Executing: ${fullCommand}`);

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        env: process.env, // Pass current env vars
        shell: false, // Safer to not use shell
      });

      let output = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        // console.log(`[${manager}] ${chunk}`); // Optional: log to server console
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        // console.error(`[${manager}] ${chunk}`); // Optional: log to server console
      });

      child.on("close", (code) => {
        const success = code === 0;
        if (!success) {
          console.error(`[PackageInstaller] Command failed with code ${code}`);
        } else {
          console.log(`[PackageInstaller] Command succeeded`);
        }
        
        resolve({
          success,
          output,
          command: fullCommand,
        });
      });

      child.on("error", (err) => {
        console.error(`[PackageInstaller] Spawn error:`, err);
        resolve({
          success: false,
          output: output + `\nSpawn error: ${err.message}`,
          command: fullCommand,
        });
      });
    });
  }
}
