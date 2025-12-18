/**
 * Generate a Cursor MCP install deeplink
 * Format: cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG
 */

export interface CursorMcpConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Generate a Cursor MCP install deeplink for a single server
 * @param serverName - Name of the MCP server
 * @param config - Server configuration with URL and optional headers
 * @returns The deeplink URL
 */
export function generateCursorMcpInstallLink(
  serverName: string,
  config: CursorMcpConfig,
): string {
  // Create the MCP server configuration object
  // Format: { url: string, headers?: Record<string, string> }
  // According to Cursor docs, the config should be the server config directly, not wrapped in mcpServers
  const serverConfig: Record<string, unknown> = {
    url: config.url,
  };
  
  if (config.headers && Object.keys(config.headers).length > 0) {
    serverConfig.headers = config.headers;
  }

  // Stringify and base64 encode
  const jsonString = JSON.stringify(serverConfig);
  const base64Config = btoa(jsonString);

  // URL encode the base64 string
  const encodedConfig = encodeURIComponent(base64Config);
  const encodedName = encodeURIComponent(serverName);

  // Build the deeplink
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodedName}&config=${encodedConfig}`;
}

