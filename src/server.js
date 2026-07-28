/**
 * Express server – Local RAG AI Assistant.
 * Serves the web UI and provides API endpoints.
 * Fully offline, connects to Foundry Local on dynamic port.
 */
import express from "express";
import path from "path";
import fs from "fs";
import { config } from "./config.js";
import { ChatEngine } from "./chatEngine.js";
import { parseFrontMatter, chunkText } from "./chunker.js";
import { VectorStore } from "./vectorStore.js";

const app = express();

// ── Security headers ──
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; connect-src 'self' https://fonts.googleapis.com;"
  );
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/markdown", limit: "2mb" }));
app.use(express.static(config.publicDir));

// ── Chat engine instance ──
const engine = new ChatEngine();

// ── SSE status broadcast ──
const statusClients = new Set();

engine.onStatus((status) => {
  const data = JSON.stringify(status);
  for (const res of statusClients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      statusClients.delete(res);
    }
  }
});

// Initialize engine asynchronously on startup
(async () => {
  try {
    await engine.init();
  } catch (err) {
    console.error("[Server] Engine init failed:", err.message);
    // Broadcast failure to any connected SSE clients
    const data = JSON.stringify({
      phase: "error",
      message: `Model initialization failed: ${err.message}`,
    });
    for (const res of statusClients) {
      try {
        res.write(`data: ${data}\n\n`);
      } catch {
        statusClients.delete(res);
      }
    }
  }
})();

// ── API: Status (SSE) ──
app.get("/api/status", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  statusClients.add(res);
  req.on("close", () => statusClients.delete(res));

  // Send current state immediately if already ready
  if (engine._ready) {
    const chunkCount = engine.store ? engine.store.count() : 0;
    res.write(
      `data: ${JSON.stringify({ phase: "ready", message: `Ready. ${chunkCount} document chunks loaded.` })}\n\n`
    );
  }
});

// ── API: Health check ──
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    modelReady: engine._ready,
    modelAlias: engine.modelAlias,
    chunkCount: engine.store ? engine.store.count() : 0,
  });
});

// ── API: List documents ──
app.get("/api/docs", (_req, res) => {
  if (!engine.store) {
    return res.status(503).json({ error: "Store not ready" });
  }
  res.json(engine.store.listDocs());
});

// ── API: Upload document (runtime ingestion) ──
app.post("/api/upload", (req, res) => {
  if (!engine.store) {
    return res.status(503).json({ error: "Store not ready" });
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("text/markdown") && !contentType.includes("text/plain")) {
    return res.status(400).json({ error: "Content-Type must be text/markdown or text/plain" });
  }

  const raw = req.body;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return res.status(400).json({ error: "Body must be non-empty markdown text" });
  }

  const { meta, body } = parseFrontMatter(raw);
  const docId = meta.id || `upload_${Date.now()}`;
  const title = meta.title || docId;
  const category = meta.category || "uploaded";

  // Remove existing chunks for this doc_id (allow re-upload)
  engine.store.removeByDocId(docId);

  const chunks = chunkText(body, config.chunkSize, config.chunkOverlap);
  for (let i = 0; i < chunks.length; i++) {
    engine.store.insert(docId, title, category, i, chunks[i]);
  }

  console.log(`[Upload] Ingested "${title}" (${chunks.length} chunks)`);
  res.json({ doc_id: docId, title, chunks: chunks.length });
});

// ── API: Chat (non-streaming) ──
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, compact } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    if (compact !== undefined) engine.setCompactMode(!!compact);

    const result = await engine.query(
      message.trim(),
      Array.isArray(history) ? history : []
    );
    res.json(result);
  } catch (err) {
    console.error("[API] Error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ── API: Chat (streaming via SSE) ──
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { message, history, compact } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    if (compact !== undefined) engine.setCompactMode(!!compact);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = engine.queryStream(
      message.trim(),
      Array.isArray(history) ? history : []
    );

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[API] Stream error:", err.message);
    const errData = JSON.stringify({ type: "error", message: err.message });
    res.write(`data: ${errData}\n\n`);
    res.end();
  }
});

// ── Start server ──
const port = config.port;
const host = config.host;

app.listen(port, host, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Local RAG AI Assistant               ║`);
  console.log(`║   http://${host}:${port}              ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});
