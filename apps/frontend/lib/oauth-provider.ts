import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformation,
  OAuthClientInformationSchema,
  OAuthClientMetadata,
  OAuthMetadata,
  OAuthTokens,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { getServerSpecificKey, SESSION_KEYS } from "./constants";
import { getAppUrl } from "./env";
import { vanillaTrpcClient } from "./trpc";

function getSafeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// OAuth client provider that works with a specific MCP server
class DbOAuthClientProvider implements OAuthClientProvider {
  private mcpServerUuid: string;
  protected serverUrl: string;

  constructor(mcpServerUuid: string, serverUrl: string) {
    this.mcpServerUuid = mcpServerUuid;
    this.serverUrl = serverUrl;
    const storage = getSafeSessionStorage();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bd3e13fa-d7f5-4c87-8069-31f803e3bb51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'F',location:'apps/frontend/lib/oauth-provider.ts:DbOAuthClientProvider:ctor',message:'Construct OAuth provider (SSR-safe)',data:{hasWindow:typeof window!=="undefined",hasSessionStorage:Boolean(storage),mcpServerUuidPresent:Boolean(mcpServerUuid),serverUrlPresent:Boolean(serverUrl)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    // Save the server URL to session storage for consistency (client only)
    storage?.setItem(SESSION_KEYS.SERVER_URL, serverUrl);
  }

  get redirectUrl() {
    return getAppUrl() + "/fe-oauth/callback";
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "MetaMCP",
      client_uri: "https://github.com/metatool-ai/metamcp",
    };
  }

  // Check if the server exists in the database
  private async serverExists() {
    try {
      const result = await vanillaTrpcClient.frontend.mcpServers.get.query({
        uuid: this.mcpServerUuid,
      });
      return result.success && !!result.data;
    } catch (error) {
      console.error("Error checking server existence:", error);
      return false;
    }
  }

  // During OAuth flow, we use sessionStorage for temporary data
  // After successful authentication, we'll save to the database
  async clientInformation() {
    try {
      // Check if server exists in the database
      const exists = await this.serverExists();

      if (exists) {
        // Get from database if server exists
        const result = await vanillaTrpcClient.frontend.oauth.get.query({
          mcp_server_uuid: this.mcpServerUuid,
        });
        if (result.success && result.data?.client_information) {
          return await OAuthClientInformationSchema.parseAsync(
            result.data.client_information,
          );
        }
      } else {
        // Get from session storage during OAuth flow
        const storage = getSafeSessionStorage();
        if (!storage) return undefined;
        const key = getServerSpecificKey(
          SESSION_KEYS.CLIENT_INFORMATION,
          this.serverUrl,
        );
        const storedInfo = storage.getItem(key);
        if (storedInfo) {
          return await OAuthClientInformationSchema.parseAsync(
            JSON.parse(storedInfo),
          );
        }
      }

      return undefined;
    } catch (error) {
      console.error("Error retrieving client information:", error);
      return undefined;
    }
  }

  async saveClientInformation(clientInformation: OAuthClientInformation) {
    // Save to session storage during OAuth flow
    const storage = getSafeSessionStorage();
    if (storage) {
      const key = getServerSpecificKey(
        SESSION_KEYS.CLIENT_INFORMATION,
        this.serverUrl,
      );
      storage.setItem(key, JSON.stringify(clientInformation));
    }
    const key = getServerSpecificKey(
      SESSION_KEYS.CLIENT_INFORMATION,
      this.serverUrl,
    );

    // If server exists, also save to database
    if (await this.serverExists()) {
      try {
        await vanillaTrpcClient.frontend.oauth.upsert.mutate({
          mcp_server_uuid: this.mcpServerUuid,
          client_information: clientInformation,
        });
      } catch (error) {
        console.error("Error saving client information to database:", error);
      }
    }
  }

  async tokens() {
    try {
      // Check if server exists in the database
      const exists = await this.serverExists();

      if (exists) {
        // Get from database if server exists
        const result = await vanillaTrpcClient.frontend.oauth.get.query({
          mcp_server_uuid: this.mcpServerUuid,
        });
        if (result.success && result.data?.tokens) {
          return await OAuthTokensSchema.parseAsync(result.data.tokens);
        }
      } else {
        // Get from session storage during OAuth flow
        const storage = getSafeSessionStorage();
        if (!storage) return undefined;
        const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl);
        const storedTokens = storage.getItem(key);
        if (storedTokens) {
          return await OAuthTokensSchema.parseAsync(JSON.parse(storedTokens));
        }
      }

      return undefined;
    } catch (error) {
      console.error("Error retrieving tokens:", error);
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens) {
    // Save to session storage during OAuth flow
    const storage = getSafeSessionStorage();
    const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl);
    storage?.setItem(key, JSON.stringify(tokens));

    // If server exists, also save to database
    if (await this.serverExists()) {
      try {
        await vanillaTrpcClient.frontend.oauth.upsert.mutate({
          mcp_server_uuid: this.mcpServerUuid,
          tokens,
        });
      } catch (error) {
        console.error("Error saving tokens to database:", error);
      }
    }
  }

  redirectToAuthorization(authorizationUrl: URL) {
    window.location.href = authorizationUrl.href;
  }

  async saveCodeVerifier(codeVerifier: string) {
    // Save to session storage during OAuth flow
    const storage = getSafeSessionStorage();
    const key = getServerSpecificKey(
      SESSION_KEYS.CODE_VERIFIER,
      this.serverUrl,
    );
    storage?.setItem(key, codeVerifier);

    // If server exists, also save to database
    if (await this.serverExists()) {
      try {
        await vanillaTrpcClient.frontend.oauth.upsert.mutate({
          mcp_server_uuid: this.mcpServerUuid,
          code_verifier: codeVerifier,
        });
      } catch (error) {
        console.error("Error saving code verifier to database:", error);
      }
    }
  }

  async codeVerifier() {
    // Check if server exists in the database
    const exists = await this.serverExists();

    if (exists) {
      // Get from database if server exists
      try {
        const result = await vanillaTrpcClient.frontend.oauth.get.query({
          mcp_server_uuid: this.mcpServerUuid,
        });
        if (result.success && result.data?.code_verifier) {
          return result.data.code_verifier;
        }
      } catch (error) {
        console.error("Error retrieving code verifier from database:", error);
      }
    }

    // Get from session storage during OAuth flow
    const storage = getSafeSessionStorage();
    if (!storage) {
      throw new Error("No code verifier saved for session (no sessionStorage)");
    }
    const key = getServerSpecificKey(
      SESSION_KEYS.CODE_VERIFIER,
      this.serverUrl,
    );
    const codeVerifier = storage.getItem(key);
    if (!codeVerifier) {
      throw new Error("No code verifier saved for session");
    }

    return codeVerifier;
  }

  clear() {
    const storage = getSafeSessionStorage();
    if (!storage) return;
    storage.removeItem(
      getServerSpecificKey(SESSION_KEYS.CLIENT_INFORMATION, this.serverUrl),
    );
    storage.removeItem(
      getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl),
    );
    storage.removeItem(
      getServerSpecificKey(SESSION_KEYS.CODE_VERIFIER, this.serverUrl),
    );
  }
}

// Debug version that overrides redirect URL and allows saving server OAuth metadata
export class DebugDbOAuthClientProvider extends DbOAuthClientProvider {
  get redirectUrl(): string {
    return getAppUrl() + "/fe-oauth/callback/debug";
  }

  saveServerMetadata(metadata: OAuthMetadata) {
    const storage = getSafeSessionStorage();
    if (!storage) return;
    const key = getServerSpecificKey(
      SESSION_KEYS.SERVER_METADATA,
      this.serverUrl,
    );
    storage.setItem(key, JSON.stringify(metadata));
  }

  getServerMetadata(): OAuthMetadata | null {
    const storage = getSafeSessionStorage();
    if (!storage) return null;
    const key = getServerSpecificKey(
      SESSION_KEYS.SERVER_METADATA,
      this.serverUrl,
    );
    const metadata = storage.getItem(key);
    if (!metadata) {
      return null;
    }
    return JSON.parse(metadata);
  }

  clear() {
    super.clear();
    const storage = getSafeSessionStorage();
    if (!storage) return;
    storage.removeItem(
      getServerSpecificKey(SESSION_KEYS.SERVER_METADATA, this.serverUrl),
    );
  }
}

// Factory function to create an OAuth provider for a specific MCP server
export function createAuthProvider(
  mcpServerUuid: string,
  serverUrl: string,
): DbOAuthClientProvider {
  return new DbOAuthClientProvider(mcpServerUuid, serverUrl);
}

// Factory function to create a debug OAuth provider for a specific MCP server
export function createDebugAuthProvider(
  mcpServerUuid: string,
  serverUrl: string,
): DebugDbOAuthClientProvider {
  return new DebugDbOAuthClientProvider(mcpServerUuid, serverUrl);
}
