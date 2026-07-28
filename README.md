# Local RAG AI Assistant

An **offline, privacy-first** RAG (Retrieval-Augmented Generation) assistant that runs entirely on your device using [Foundry Local](https://github.com/microsoft/foundry-local) and **Phi-3.5 Mini**.

Ask questions about your own documents — with zero internet connectivity required.

## Architecture

Inspired by [leestott/local-rag](https://github.com/leestott/local-rag).

```
┌─────────────────────────────────────────────────────────┐
│                    Browser UI (SSE)                     │
│            Dark-themed chat + progress bar              │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────────────┐
│                Express Server (src/server.js)           │
│  /api/status    ← SSE model init progress               │
│  /api/chat      ← non-streaming chat                    │
│  /api/chat/stream ← SSE token streaming                 │
│  /api/docs      ← list knowledge base documents        │
│  /api/upload    ← runtime document ingestion            │
│  /api/health    ← health check                          │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────────┐
        │                                 │
┌───────▼────────┐              ┌─────────▼────────┐
│  ChatEngine    │              │  VectorStore     │
│  Foundry Local │              │  SQLite + TF-IDF │
│  Phi-3.5 Mini  │              │  Inverted Index  │
└────────────────┘              └──────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Server | Express.js |
| LLM | Phi-3.5 Mini via Foundry Local SDK |
| Vector Store | SQLite + TF-IDF (better-sqlite3) |
| UI | Vanilla HTML/CSS/JS (single file) |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- [Foundry Local](https://github.com/microsoft/foundry-local) installed and running

### 1. Install dependencies

```bash
npm install
```

### 2. Add your documents

Place markdown (`.md`) files in the `docs/` folder. Use YAML front-matter for metadata:

```markdown
---
id: my-document
title: My Document Title
category: technical
---

# My Document

Your content here...
```

### 3. Ingest documents

```bash
npm run ingest
```

This reads all `.md` files from `docs/`, splits them into chunks, builds TF-IDF vectors, and stores them in `data/rag.db`.

### 4. Start the server

```bash
npm start
```

Or in watch mode (auto-restarts on file changes):

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

## Project Structure

```
├── docs/                    # Your markdown knowledge base
│   ├── 01-productivity-methods.md
│   ├── 02-stress-and-wellness.md
│   └── 03-focus-and-deep-work.md
│
├── src/
│   ├── server.js            # Express server + API endpoints
│   ├── chatEngine.js        # Foundry Local SDK + RAG pipeline
│   ├── vectorStore.js       # SQLite TF-IDF vector store
│   ├── chunker.js           # Text chunking + front-matter parser
│   ├── prompts.js           # System prompts (full + compact)
│   ├── ingest.js            # Document ingestion script
│   └── config.js            # Configuration
│
├── public/
│   └── index.html           # Web UI (single file, inline CSS+JS)
│
├── data/
│   └── rag.db               # SQLite database (generated)
│
└── package.json
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + model status |
| GET | `/api/status` | SSE stream of model init progress |
| GET | `/api/docs` | List all ingested documents |
| POST | `/api/chat` | Non-streaming chat |
| POST | `/api/chat/stream` | SSE streaming chat |
| POST | `/api/upload` | Upload and ingest a markdown document |

### Chat request body

```json
{
  "message": "How do I use the Pomodoro technique?",
  "history": [],
  "compact": false
}
```

### Chat response

```json
{
  "answer": "The Pomodoro technique involves...",
  "sources": [
    {
      "doc_id": "productivity-methods",
      "title": "Productivity Methods",
      "category": "productivity",
      "score": 0.847,
      "snippet": "The Pomodoro Technique is a time management method..."
    }
  ]
}
```

## Features

- 🔒 **100% Offline** — no data leaves your machine
- ⚡ **Streaming responses** — tokens appear as they generate
- 📡 **Live progress** — watch the model initialize in real-time
- 📄 **Runtime upload** — add documents without restarting
- 🔋 **Edge/Compact mode** — shorter prompts for NPU-constrained devices
- 📊 **Source citations** — collapsible source references per answer
- 🌙 **Dark UI** — field-ready dark theme

## Configuration

Edit `src/config.js`:

```js
export const config = {
  model: "phi-3.5-mini",   // Foundry Local model alias
  chunkSize: 200,           // tokens per chunk
  chunkOverlap: 25,         // overlap between chunks
  topK: 3,                  // context chunks per query
  port: 3000,
  host: "127.0.0.1",
};
```

## License

MIT
