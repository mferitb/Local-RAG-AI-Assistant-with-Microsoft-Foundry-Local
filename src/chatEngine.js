/**
 * Foundry Local chat engine.
 * Uses the Foundry Local SDK to discover, load, and run inference
 * on a local model. Performs RAG retrieval and generates responses.
 * Selects the hardware-optimised model variant automatically and
 * reports download/load progress via a status callback.
 */
import { FoundryLocalManager } from "foundry-local-sdk";
import { VectorStore } from "./vectorStore.js";
import { config } from "./config.js";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_COMPACT } from "./prompts.js";

export class ChatEngine {
  constructor() {
    this.chatClient = null;
    this.model = null;
    this.store = null;
    this.compactMode = false;
    this.modelAlias = null;
    this._ready = false;
    /** @type {(status: {phase: string, message: string, progress?: number}) => void} */
    this._statusCallback = null;
  }

  /** Register a callback that receives init status updates for the UI. */
  onStatus(callback) {
    this._statusCallback = callback;
  }

  _emitStatus(phase, message, progress) {
    const status = { phase, message, ...(progress !== undefined && { progress }) };
    console.log(`[ChatEngine] ${message}`);
    if (this._statusCallback) this._statusCallback(status);
  }

  /** Toggle between full and compact (edge) prompting modes. */
  setCompactMode(enabled) {
    this.compactMode = !!enabled;
  }

  /**
   * Initialize the engine: create Foundry Local manager, discover and load
   * the best model variant for this hardware, and open the vector store.
   */
  async init() {
    this._emitStatus("init", "Initializing Foundry Local SDK...");

    // Create the manager (requires appName)
    const manager = FoundryLocalManager.create({ appName: "local-rag-assistant" });
    const catalog = manager.catalog;

    this._emitStatus("catalog", "Discovering available models...");
    // catalog.getModel() is async
    this.model = await catalog.getModel(config.model);
    this.modelAlias = this.model.alias;

    // The SDK auto-selects the best variant for this hardware (GPU > NPU > CPU)
    this._emitStatus("variant", `Selected model: ${this.modelAlias}`);

    // Download the model if not already cached, with progress reporting
    if (!this.model.isCached) {
      this._emitStatus("download", `Downloading ${this.modelAlias}... This may take a few minutes on first run.`, 0);
      await this.model.download((progress) => {
        // SDK gives progress as 0-100 integer
        const pct = Math.round(progress);
        this._emitStatus("download", `Downloading ${this.modelAlias}... ${pct}%`, pct / 100);
      });
      this._emitStatus("download", `Download complete.`, 1);
    } else {
      this._emitStatus("cached", `Model already cached: ${this.modelAlias}`);
    }

    // Load model into memory — model.load() is async
    this._emitStatus("load", `Loading ${this.modelAlias} into memory...`);
    await this.model.load();

    // Get the chat client via the correct SDK method: createChatClient()
    this.chatClient = this.model.createChatClient();
    this._emitStatus("ready", "Model ready. Loading document store...");

    // Open the vector store (must already have data from ingest)
    this.store = new VectorStore(config.dbPath);
    await this.store.open();
    const chunkCount = this.store.count();
    this._emitStatus("ready", `Ready. ${chunkCount} document chunks loaded.`);
    this._ready = true;
  }

  _isReady() {
    return this._ready && this.chatClient !== null && this.store !== null;
  }

  /**
   * Build messages array for the chat model from retrieved context.
   */
  _buildMessages(query, chunks, history = []) {
    const systemPrompt = this.compactMode ? SYSTEM_PROMPT_COMPACT : SYSTEM_PROMPT;

    const contextBlock = chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[${i + 1}] ${c.title ? `**${c.title}**` : c.doc_id}${c.category ? ` (${c.category})` : ""}\n${c.content}`
          )
          .join("\n\n---\n\n")
      : "(No relevant documents found in the knowledge base.)";

    const userMessage = `Context from knowledge base:\n\n${contextBlock}\n\n---\n\nQuestion: ${query}`;

    const messages = [
      { role: "system", content: systemPrompt },
      // Keep last 3 conversation turns (6 messages) for context
      ...history.slice(-6),
      { role: "user", content: userMessage },
    ];

    return messages;
  }

  /**
   * Non-streaming query — returns full response object.
   * Uses chatClient.completeChat() which is the correct SDK method.
   */
  async query(message, history = []) {
    if (!this._isReady()) {
      throw new Error("ChatEngine not initialized. Call init() first.");
    }

    const chunks = this.store.search(message, config.topK);
    const messages = this._buildMessages(message, chunks, history);

    // SDK method: completeChat(messages) — returns OpenAI-format response
    const response = await this.chatClient.completeChat(messages);
    const answer = response.choices[0].message.content;

    return {
      answer,
      sources: chunks.map((c) => ({
        doc_id: c.doc_id,
        title: c.title || c.doc_id,
        category: c.category || null,
        score: Math.round(c.score * 1000) / 1000,
        snippet: c.content.slice(0, 120) + (c.content.length > 120 ? "..." : ""),
      })),
    };
  }

  /**
   * Streaming query — async generator that yields chunks.
   * Uses chatClient.completeStreamingChat() which returns an AsyncIterable.
   */
  async *queryStream(message, history = []) {
    if (!this._isReady()) {
      throw new Error("ChatEngine not initialized. Call init() first.");
    }

    const chunks = this.store.search(message, config.topK);
    const messages = this._buildMessages(message, chunks, history);

    // Emit sources first so UI can show them before the answer arrives
    yield {
      type: "sources",
      sources: chunks.map((c) => ({
        doc_id: c.doc_id,
        title: c.title || c.doc_id,
        category: c.category || null,
        score: Math.round(c.score * 1000) / 1000,
        snippet: c.content.slice(0, 120) + (c.content.length > 120 ? "..." : ""),
      })),
    };

    // Stream the answer tokens using completeStreamingChat()
    try {
      const stream = this.chatClient.completeStreamingChat(messages);
      for await (const event of stream) {
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          yield { type: "delta", delta };
        }
      }
    } catch (err) {
      // Fallback: streaming not supported — return full response
      console.warn("[ChatEngine] Streaming failed, falling back to blocking call:", err.message);
      try {
        const response = await this.chatClient.completeChat(messages);
        const answer = response.choices[0].message.content || "";
        yield { type: "delta", delta: answer };
      } catch (fallbackErr) {
        yield { type: "error", message: fallbackErr.message };
      }
    }

    yield { type: "done" };
  }
}
