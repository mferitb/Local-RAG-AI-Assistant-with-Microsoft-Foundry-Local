# Local RAG Assistant — Powered by Microsoft Foundry Local

A fully offline, local document Q&A assistant that uses the
**Retrieval-Augmented Generation (RAG)** pattern with
[Microsoft Foundry Local](https://github.com/microsoft/foundry).

Ask questions about your own documents and get AI-generated answers —
**nothing leaves your machine**.

---

## Features

- **Fully offline** — all model inference runs locally via Foundry Local.
- **RAG pipeline** — retrieves the most relevant document chunks before
  generating an answer, reducing hallucinations.
- **Simple web UI** — a clean, dark-themed chat interface served by Flask.
- **SQLite vector store** — lightweight, zero-config database for embeddings.

---

## Prerequisites

| Requirement           | Version / Notes                                      |
| --------------------- | ---------------------------------------------------- |
| Python                | 3.11 or newer                                        |
| Microsoft Foundry Local | [Installation guide](https://github.com/microsoft/foundry) |
| Models (downloaded)   | `phi-3.5-mini` (chat) and `qwen3-embedding-0.6b` (embeddings) |

### Install Foundry Local & download models

```bash
# Follow the official installation guide for your OS:
# https://github.com/microsoft/foundry

# Then download the required models:
foundry model download phi-3.5-mini
foundry model download qwen3-embedding-0.6b
```

---

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd local-rag-assistant

# 2. Create a virtual environment (recommended)
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS / Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. (Optional) Verify your Foundry Local setup
python tests/test_hello_model.py

# 5. Start the server
python main.py
```

Then open **http://localhost:5000** in your browser.

---

## Project Structure

```
local-rag-assistant/
├── main.py                # Flask entry point
├── config.py              # Model names, DB path, tuneable constants
├── requirements.txt       # Python dependencies
├── data/
│   ├── documents/         # Put your .txt source documents here
│   └── rag.db             # SQLite database (auto-created)
├── src/
│   ├── __init__.py
│   ├── db.py              # Database connection & schema
│   ├── ingest.py          # Document chunking & embedding (skeleton)
│   ├── retrieval.py       # Semantic search over embeddings (skeleton)
│   └── llm.py             # Chat completion via Foundry Local (skeleton)
├── web/
│   ├── templates/
│   │   └── index.html     # Chat UI
│   └── static/
│       ├── style.css      # Dark-themed styling
│       └── script.js      # Client-side fetch logic
└── tests/
    └── test_hello_model.py  # SDK smoke test
```

---

## How It Works (RAG Pipeline)

1. **Ingest** — Text documents are split into chunks, each chunk is
   embedded using `qwen3-embedding-0.6b`, and stored in SQLite.
2. **Retrieve** — When a user asks a question, the query is embedded
   and compared against stored chunks via cosine similarity. The top-K
   most relevant chunks are selected.
3. **Generate** — The retrieved chunks are passed as context to
   `phi-3.5-mini`, which generates a grounded answer.

> **Note:** The ingestion and retrieval modules are currently skeletons
> with `TODO` placeholders. They will be implemented in upcoming weeks.

---

## Next Steps

| Week | Task                                                     | File(s)                          |
| ---- | -------------------------------------------------------- | -------------------------------- |
| 3    | Implement `split_text()` and `embed_text()`              | `src/ingest.py`                  |
| 3    | Implement `cosine_similarity()` and `get_top_chunks()`   | `src/retrieval.py`               |
| 3    | Implement `build_prompt()` and wire up `answer_query()`  | `src/llm.py`                     |
| 4    | Add PDF / DOCX support to the ingestion pipeline         | `src/ingest.py`                  |
| 4    | Improve chunking (sentence-aware splitting)              | `src/ingest.py`                  |
| 5    | Add source citations to the UI                           | `web/`, `src/llm.py`            |

---

## License

This project is for educational purposes (summer school).
