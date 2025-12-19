import { createRequire } from "node:module";

/**
 * Token counter with small in-memory cache of encoders.
 * We default to `cl100k_base` when a model name isn't recognized by tiktoken.
 */
class TokenCounter {
  private encoders = new Map<string, any>();
  private require = createRequire(import.meta.url);

  private getEncoder(model: string) {
    if (this.encoders.has(model)) return this.encoders.get(model)!;
    // Lazy-load tiktoken at runtime so the server doesn't crash at startup if deps aren't installed yet
    // (e.g. in a dev container before pnpm install completes).
    const { encoding_for_model, get_encoding } = this.require("tiktoken") as {
      encoding_for_model: (model: string) => any;
      get_encoding: (name: string) => any;
    };
    try {
      const enc = encoding_for_model(model as any);
      this.encoders.set(model, enc);
      return enc;
    } catch {
      const enc = get_encoding("cl100k_base");
      this.encoders.set(model, enc);
      return enc;
    }
  }

  count(model: string, text: string): number {
    const enc = this.getEncoder(model);
    // NOTE: tiktoken encodes to token ids array
    return enc.encode(text).length;
  }

  /**
   * Best-effort cleanup to avoid leaking memory if many model names are used.
   */
  clear(): void {
    for (const [, enc] of this.encoders) {
      try {
        // Some builds expose free(); safe to ignore if not present
        (enc as any).free?.();
      } catch {}
    }
    this.encoders.clear();
  }
}

export const tokenCounter = new TokenCounter();


