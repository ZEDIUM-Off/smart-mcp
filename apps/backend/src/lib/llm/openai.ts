type OpenAIChatRole = "system" | "user" | "assistant";

export interface OpenAIChatMessage {
  role: OpenAIChatRole;
  content: string;
}

export interface OpenAIChatJsonParams {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

export async function openaiChatJson<T>(
  params: OpenAIChatJsonParams,
): Promise<T> {
  const baseUrl = (params.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;

  const timeoutMs = params.timeoutMs ?? 30000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature ?? 0.2,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ] satisfies OpenAIChatMessage[],
        response_format: { type: "json_object" },
      }),
      signal: ac.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `OpenAI error (${resp.status}): ${text || resp.statusText}`,
      );
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenAI response missing JSON content");
    }

    try {
      return JSON.parse(content) as T;
    } catch (e) {
      throw new Error(
        `OpenAI returned non-JSON content (expected json_object). Raw: ${content.slice(0, 500)}`,
      );
    }
  } finally {
    clearTimeout(t);
  }
}


