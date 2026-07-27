"""
llm.py — Chat completion via Foundry Local.

This module is responsible for:
1. Constructing a prompt that includes retrieved context chunks and the
   user's question.
2. Sending the prompt to the Foundry Local chat model
   (``config.CHAT_MODEL``).
3. Returning the model's answer as a plain string.
"""

from __future__ import annotations

import logging
from typing import List

from config import CHAT_MODEL, TOP_K, MAX_TOKENS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompt — safety-first, structured responses
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a helpful personal assistant. Answer based on the provided context. Be concise and practical. Use bullet points for lists. Start with a brief summary."""



def build_prompt(question: str, context_chunks: List[tuple]) -> list[dict]:
    """Build the messages array for the chat model.

    The prompt instructs the model to answer *question* based
    only on the provided *context_chunks*.

    Parameters
    ----------
    question : str
        The user's question.
    context_chunks : List[tuple]
        Relevant text chunks from the vector store, each as
        ``(content, source_filename, similarity_score)``.

    Returns
    -------
    list[dict]
        A list of message dicts ready for the chat API.
    """
    # Build context block from retrieved chunks
    if context_chunks:
        context_parts = []
        for i, (content, source, score) in enumerate(context_chunks, 1):
            context_parts.append(
                f"--- Source: {source} (relevance: {score:.2f}) ---\n{content}"
            )
        context_block = "\n\n".join(context_parts)
    else:
        context_block = "(No relevant context found in the knowledge base.)"

    user_message = (
        f"Context from the knowledge base:\n\n"
        f"{context_block}\n\n"
        f"---\n\n"
        f"Question: {question}"
    )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


def answer_query(question: str) -> str:
    """Answer a user question using the RAG pipeline (non-streaming).

    Pipeline
    --------
    1. Call ``src.retrieval.get_top_chunks(question)`` to get context.
    2. Call ``build_prompt(question, chunks)`` to assemble the prompt.
    3. Send the prompt to the Foundry Local chat model.
    4. Return the model's response text.

    Parameters
    ----------
    question : str
        The user's natural-language question.

    Returns
    -------
    str
        The model's answer.
    """
    from src.retrieval import get_top_chunks
    from src.foundry_manager import get_foundry_manager

    # 1. Retrieve relevant context
    logger.info("Retrieving context for: %s", question)
    context_chunks = get_top_chunks(question, top_k=TOP_K)

    if context_chunks:
        logger.info(
            "Found %d relevant chunks (best score: %.3f)",
            len(context_chunks),
            context_chunks[0][2],
        )
    else:
        logger.warning("No context chunks found for the query.")

    # 2. Build the prompt
    messages = build_prompt(question, context_chunks)

    # 3. Send to the chat model
    logger.info("Sending prompt to chat model '%s'...", CHAT_MODEL)
    chat_client = get_foundry_manager().get_chat()
    response = chat_client.complete_chat(messages)

    # 4. Extract and return the response text
    answer = response.choices[0].message.content
    logger.info("Received response (%d chars)", len(answer) if answer else 0)

    return answer or "The model returned an empty response."


def stream_answer(question: str):
    """Answer a user question using the RAG pipeline, streaming tokens as they arrive.

    This is a generator that yields text chunks (tokens or small groups of
    tokens) as they are produced by the model, enabling real-time display
    in the UI without waiting for the full response.

    Pipeline
    --------
    1. Retrieve context chunks (same as ``answer_query``).
    2. Build the prompt.
    3. Call the streaming chat API and yield each delta chunk.

    Parameters
    ----------
    question : str
        The user's natural-language question.

    Yields
    ------
    str
        Incremental text tokens from the model.
    """
    from src.retrieval import get_top_chunks
    from src.foundry_manager import get_foundry_manager

    # 1. Retrieve relevant context
    logger.info("[stream] Retrieving context for: %s", question)
    context_chunks = get_top_chunks(question, top_k=TOP_K)

    if context_chunks:
        logger.info(
            "[stream] Found %d relevant chunks (best score: %.3f)",
            len(context_chunks),
            context_chunks[0][2],
        )
    else:
        logger.warning("[stream] No context chunks found for the query.")

    # 2. Build the prompt
    messages = build_prompt(question, context_chunks)

    # 3. Stream from the chat model
    logger.info("[stream] Streaming from chat model '%s'...", CHAT_MODEL)
    chat_client = get_foundry_manager().get_chat()

    try:
        # Try the streaming API first (preferred path)
        stream = chat_client.complete_chat_streaming(messages)
        total_chars = 0
        for event in stream:
            delta = event.choices[0].delta.content if event.choices else None
            if delta:
                total_chars += len(delta)
                yield delta
        logger.info("[stream] Finished streaming (%d chars)", total_chars)
    except AttributeError:
        # Fallback: model client does not support streaming — return all at once
        logger.warning(
            "[stream] Streaming not supported by this client; falling back to blocking call."
        )
        response = chat_client.complete_chat(messages)
        answer = response.choices[0].message.content or "The model returned an empty response."
        yield answer

