"""
retrieval.py — Semantic retrieval over the vector store.

This module is responsible for:
1. Accepting a user query string.
2. Embedding the query using the same embedding model as ingestion.
3. Computing cosine similarity between the query embedding and every
   stored chunk embedding.
4. Returning the top-K most similar chunks as context for the LLM.
"""

from __future__ import annotations

import logging
from typing import List, Tuple

import numpy as np

from config import TOP_K

logger = logging.getLogger(__name__)


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute the cosine similarity between two vectors.

    Parameters
    ----------
    vec_a, vec_b : np.ndarray
        Two vectors of the same length.

    Returns
    -------
    float
        Cosine similarity in the range [-1, 1].
    """
    dot = np.dot(vec_a, vec_b)
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot / (norm_a * norm_b))


def get_top_chunks(query: str, top_k: int = TOP_K) -> List[Tuple[str, str, float]]:
    """Retrieve the *top_k* most relevant document chunks for *query*.

    Steps
    -----
    1. Embed *query* using the Foundry Local embedding model.
    2. Fetch all stored chunks and their embeddings from the database.
    3. Deserialize each stored embedding (``numpy.frombuffer``).
    4. Compute cosine similarity between the query vector and each chunk
       vector.
    5. Sort descending by similarity and return the top *top_k* results.

    Parameters
    ----------
    query : str
        The user's natural-language question.
    top_k : int
        Number of results to return.

    Returns
    -------
    List[Tuple[str, str, float]]
        A list of ``(chunk_content, source_filename, similarity_score)``
        tuples, ordered from most to least relevant.
    """
    from src.ingest import embed_text
    from src.db import fetch_all_chunks

    # 1. Embed the query
    query_embedding = np.array(embed_text(query), dtype=np.float32)

    # 2. Fetch all stored chunks
    rows = fetch_all_chunks()
    if not rows:
        logger.warning("No chunks in the database. Did you run ingestion?")
        return []

    # 3. Score every chunk
    scored: List[Tuple[str, str, float]] = []
    for _id, content, embedding_bytes, source in rows:
        if embedding_bytes is None:
            continue
        chunk_embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
        score = cosine_similarity(query_embedding, chunk_embedding)
        scored.append((content, source, score))

    # 4. Sort descending by similarity
    scored.sort(key=lambda x: x[2], reverse=True)

    # 5. Return top-K
    return scored[:top_k]
