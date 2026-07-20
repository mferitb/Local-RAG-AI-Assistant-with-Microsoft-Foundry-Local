"""
Configuration constants for the Local RAG Assistant.

Centralizes all tuneable parameters so that every module imports
from one place.  Adjust values here when swapping models or
changing chunking strategy.
"""

# ---------------------------------------------------------------------------
# Model identifiers (Foundry Local catalog names)
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = "qwen3-embedding-0.6b"
CHAT_MODEL = "phi-3.5-mini"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DB_PATH = "data/rag.db"

# ---------------------------------------------------------------------------
# Document ingestion
# ---------------------------------------------------------------------------
CHUNK_SIZE = 500        # Maximum number of characters per chunk
CHUNK_OVERLAP = 50      # Overlap between consecutive chunks (characters)
DOCUMENTS_DIR = "data/documents"

# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
TOP_K = 3               # Number of top chunks to retrieve for context

# ---------------------------------------------------------------------------
# Flask server
# ---------------------------------------------------------------------------
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5000
FLASK_DEBUG = True
