import type { ToolSearch } from "./types";

import { discoveryService } from "../discovery";

export class DiscoveryToolSearch implements ToolSearch {
  async search(namespaceUuid: string, query: string, limit: number) {
    return await discoveryService.search(namespaceUuid, query, limit);
  }
}


