import { openaiChatJson } from "../llm/openai";
import type { LlmAdapter } from "./types";

export class OpenAiLlmAdapter implements LlmAdapter {
  constructor(
    private readonly params: {
      apiKey: string;
      baseUrl?: string;
      timeoutMs?: number;
    },
  ) {}

  async chatJson<T>(input: {
    model: string;
    system: string;
    user: string;
  }): Promise<T> {
    return await openaiChatJson<T>({
      apiKey: this.params.apiKey,
      baseUrl: this.params.baseUrl,
      timeoutMs: this.params.timeoutMs,
      model: input.model,
      system: input.system,
      user: input.user,
    });
  }
}


