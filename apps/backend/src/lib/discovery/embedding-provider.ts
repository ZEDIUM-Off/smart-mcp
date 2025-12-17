/**
 * Embedding Provider
 *
 * Handles ONNX model loading and inference using @xenova/transformers.
 * Uses lazy loading to defer model download until first use.
 * Model is cached in memory after loading.
 */

import { pipeline, type Pipeline } from "@xenova/transformers";

export class EmbeddingProvider {
  private static instance: EmbeddingProvider;
  private extractor: Pipeline | null = null;
  private loadingPromise: Promise<Pipeline> | null = null;

  // Model: all-MiniLM-L6-v2 (~23MB) - good balance of size and quality
  // Produces 384-dimensional embeddings
  private readonly modelName = "Xenova/all-MiniLM-L6-v2";

  private constructor() {}

  public static getInstance(): EmbeddingProvider {
    if (!EmbeddingProvider.instance) {
      EmbeddingProvider.instance = new EmbeddingProvider();
    }
    return EmbeddingProvider.instance;
  }

  /**
   * Initialize the model if not already loaded.
   * Downloads the model on first run (cached locally by the library).
   * Uses a loading promise to prevent concurrent downloads.
   */
  private async getExtractor(): Promise<Pipeline> {
    if (this.extractor) {
      return this.extractor;
    }

    // Prevent concurrent loading attempts
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      console.log(`[Discovery] Loading embedding model: ${this.modelName}...`);
      const startTime = Date.now();

      try {
        // feature-extraction pipeline for sentence embeddings
        this.extractor = await pipeline("feature-extraction", this.modelName, {
          quantized: true, // Use quantized model for better memory/speed
        });

        const loadTime = Date.now() - startTime;
        console.log(`[Discovery] Model loaded in ${loadTime}ms`);

        return this.extractor;
      } catch (error) {
        this.loadingPromise = null;
        throw error;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Generate an embedding vector for the given text.
   * Returns a normalized 384-dimensional vector.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();

    // Mean pooling with normalization for sentence embeddings
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });

    // Convert Tensor to plain array
    return Array.from(output.data as Float32Array);
  }

  /**
   * Pre-load the model at server startup (optional).
   * Call this during initialization if you want faster first queries.
   */
  public async warmup(): Promise<void> {
    console.log("[Discovery] Warming up embedding model...");
    await this.getExtractor();
    console.log("[Discovery] Model ready");
  }

  /**
   * Check if the model is currently loaded
   */
  public isLoaded(): boolean {
    return this.extractor !== null;
  }
}

// Export singleton instance
export const embeddingProvider = EmbeddingProvider.getInstance();
