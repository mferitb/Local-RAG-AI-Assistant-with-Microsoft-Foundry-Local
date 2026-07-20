"""
db.py — SQLite database helper for the Local RAG Assistant.

Responsibilities
-----------------
* Open / create the SQLite database file.
* Create the ``documents`` table if it does not exist.
* Provide convenience functions for inserting and querying rows.

Table schema
------------
documents
    id        INTEGER PRIMARY KEY AUTOINCREMENT
    content   TEXT     — the text chunk
    embedding BLOB     — the embedding vector stored as raw bytes (numpy .tobytes())
    source    TEXT     — the original file name / path the chunk came from
"""

import os
import sqlite3

from config import DB_PATH


def get_connection() -> sqlite3.Connection:
    """Return a connection to the SQLite database, creating the file if needed."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    return conn


def init_db() -> None:
    """Create the ``documents`` table if it does not already exist.

    Call this once at application startup (e.g. from ``main.py``).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            content   TEXT    NOT NULL,
            embedding BLOB,
            source    TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def insert_chunk(content: str, embedding: bytes, source: str) -> None:
    """Insert a single document chunk with its embedding into the database.

    Parameters
    ----------
    content : str
        The text content of the chunk.
    embedding : bytes
        The embedding vector serialized as bytes (e.g. via ``numpy.ndarray.tobytes()``).
    source : str
        The file path or name the chunk originated from.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (content, embedding, source) VALUES (?, ?, ?)",
        (content, embedding, source),
    )
    conn.commit()
    conn.close()


def fetch_all_chunks() -> list[tuple]:
    """Return every row from the ``documents`` table.

    Returns
    -------
    list[tuple]
        Each tuple is ``(id, content, embedding_bytes, source)``.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, content, embedding, source FROM documents")
    rows = cursor.fetchall()
    conn.close()
    return rows


def clear_documents() -> None:
    """Delete all rows from the ``documents`` table.

    Called before re-ingestion to avoid duplicate chunks.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents")
    conn.commit()
    conn.close()

