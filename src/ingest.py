"""
ingest.py — Document ingestion pipeline.

This module is responsible for:
1. Reading raw text files from ``config.DOCUMENTS_DIR``.
2. Splitting each file into overlapping chunks of ``config.CHUNK_SIZE`` characters.
3. Generating an embedding vector for each chunk using the Foundry Local
   embedding model (``config.EMBEDDING_MODEL``).
4. Storing each (chunk_text, embedding, source_filename) row in the SQLite
   database via ``src.db.insert_chunk()``.

Usage
-----
    # As a module
    from src.ingest import ingest_documents
    count = ingest_documents()

    # From the command line
    python -m src.ingest
"""

from __future__ import annotations

import os
import sys
import logging
from typing import List

import numpy as np

from config import CHUNK_SIZE, CHUNK_OVERLAP, DOCUMENTS_DIR

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Text splitting
# ---------------------------------------------------------------------------

def split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split *text* into overlapping chunks.

    Uses a sliding-window approach that tries to respect sentence
    boundaries (splits on ". " or "\\n" near the boundary rather
    than mid-word).

    Parameters
    ----------
    text : str
        The full text of a document.
    chunk_size : int
        Maximum number of characters per chunk.
    overlap : int
        Number of characters shared between consecutive chunks.

    Returns
    -------
    List[str]
        A list of text chunks.
    """
    if not text or not text.strip():
        return []

    text = text.strip()

    # If the text fits in a single chunk, return it as-is
    if len(text) <= chunk_size:
        return [text]

    chunks: List[str] = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # If we're not at the end of the text, try to find a good break point
        if end < len(text):
            # Look for sentence boundary near the end of the chunk
            # Search backwards from `end` within the last 20% of the chunk
            search_start = max(start, end - chunk_size // 5)
            slice_text = text[search_start:end]

            # Try to break at a sentence boundary
            best_break = -1
            for sep in [". ", ".\n", "\n\n", "\n", "; ", ", "]:
                idx = slice_text.rfind(sep)
                if idx != -1:
                    best_break = search_start + idx + len(sep)
                    break

            if best_break > start:
                end = best_break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start forward, accounting for overlap
        step = (end - start) - overlap
        if step <= 0:
            step = max(1, chunk_size - overlap)
        start += step

    return chunks


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """Return the embedding vector for a single piece of text.

    Uses the Foundry Local SDK to call the embedding model specified
    in ``config.EMBEDDING_MODEL``.

    Parameters
    ----------
    text : str
        A text chunk to embed.

    Returns
    -------
    list[float]
        The embedding vector (list of floats).
    """
    from src.foundry_manager import get_foundry_manager

    embedding_client = get_foundry_manager().get_embedding()
    response = embedding_client.generate_embedding(text)

    # The response follows the OpenAI CreateEmbeddingResponse format:
    # response.data[0].embedding is the list of floats
    return response.data[0].embedding


def embed_texts_batch(texts: List[str]) -> List[list[float]]:
    """Embed multiple texts in a single batch request.

    Parameters
    ----------
    texts : List[str]
        A list of text chunks to embed.

    Returns
    -------
    List[list[float]]
        A list of embedding vectors, one per input text.
    """
    from src.foundry_manager import get_foundry_manager

    embedding_client = get_foundry_manager().get_embedding()
    response = embedding_client.generate_embeddings(texts)

    # Sort by index to maintain input order
    sorted_data = sorted(response.data, key=lambda x: x.index)
    return [item.embedding for item in sorted_data]


# ---------------------------------------------------------------------------
# Full ingestion pipeline
# ---------------------------------------------------------------------------

def ingest_documents() -> int:
    """Read every ``.txt`` file in ``DOCUMENTS_DIR``, chunk it, embed it,
    and store it in the database.

    Returns
    -------
    int
        The total number of chunks stored.
    """
    from src.db import init_db, insert_chunk, clear_documents

    # Ensure the database and table exist
    init_db()

    # Clear existing data to avoid duplicates on re-ingestion
    clear_documents()

    if not os.path.isdir(DOCUMENTS_DIR):
        logger.warning("Documents directory '%s' does not exist.", DOCUMENTS_DIR)
        return 0

    # Gather all text files
    files = [
        f for f in os.listdir(DOCUMENTS_DIR)
        if f.endswith((".txt", ".md"))
    ]

    if not files:
        logger.warning("No .txt or .md files found in '%s'.", DOCUMENTS_DIR)
        return 0

    total_chunks = 0

    for i, filename in enumerate(sorted(files), 1):
        filepath = os.path.join(DOCUMENTS_DIR, filename)
        print(f"[{i}/{len(files)}] Processing: {filename}")

        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        # Split into chunks
        chunks = split_text(text)
        if not chunks:
            print(f"  Skipped (empty file)")
            continue

        print(f"  {len(chunks)} chunk(s) created")

        # Embed and store each chunk
        for j, chunk in enumerate(chunks):
            embedding = embed_text(chunk)
            embedding_bytes = np.array(embedding, dtype=np.float32).tobytes()
            insert_chunk(chunk, embedding_bytes, filename)

            if (j + 1) % 5 == 0 or j == len(chunks) - 1:
                print(f"  Embedded {j + 1}/{len(chunks)} chunks")

        total_chunks += len(chunks)

    print(f"\nIngestion complete: {total_chunks} chunks from {len(files)} file(s)")
    return total_chunks


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Allow running as: python -m src.ingest
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    logging.basicConfig(level=logging.INFO)
    ingest_documents()
