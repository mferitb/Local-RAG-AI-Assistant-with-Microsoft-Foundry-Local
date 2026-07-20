"""
foundry_manager.py — Singleton wrapper for the Foundry Local SDK.

Manages the lifecycle of the FoundryLocalManager and provides convenient
access to the chat and embedding model clients.

Usage
-----
    from src.foundry_manager import get_foundry_manager

    manager = get_foundry_manager()
    chat_client = manager.get_chat()
    embedding_client = manager.get_embedding()
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

from foundry_local_sdk import FoundryLocalManager, Configuration
from foundry_local_sdk.openai.chat_client import ChatClient
from foundry_local_sdk.openai.embedding_client import EmbeddingClient

from config import CHAT_MODEL, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_APP_NAME = "local-rag-assistant"
_instance: Optional["FoundryManager"] = None
_lock = threading.Lock()


class FoundryManager:
    """Thin wrapper that lazily downloads, loads, and caches Foundry models.

    Call :func:`get_foundry_manager` to obtain the singleton instance.
    """

    def __init__(self) -> None:
        logger.info("Initializing Foundry Local SDK...")

        config = Configuration(
            app_name=_APP_NAME,
            web=Configuration.WebService(),   # enables the OpenAI-compat web service
        )
        FoundryLocalManager.initialize(config)
        self._manager = FoundryLocalManager.instance

        # Lazily populated model references
        self._chat_model = None
        self._embedding_model = None
        self._chat_client: Optional[ChatClient] = None
        self._embedding_client: Optional[EmbeddingClient] = None

    # ------------------------------------------------------------------
    # Model helpers
    # ------------------------------------------------------------------

    def _ensure_model_ready(self, alias: str):
        """Download (if needed) and load a model by its catalog alias."""
        model = self._manager.catalog.get_model(alias)
        if model is None:
            raise RuntimeError(
                f"Model '{alias}' not found in the Foundry Local catalog. "
                "Check that Foundry Local is installed and the model name is correct."
            )

        if not model.is_cached:
            logger.info("Downloading model '%s'…", alias)
            model.download(
                progress_callback=lambda pct: logger.info(
                    "  %s download: %.0f%%", alias, pct
                )
            )

        if not model.is_loaded:
            logger.info("Loading model '%s' into memory…", alias)
            model.load()
            logger.info("Model '%s' loaded.", alias)

        return model

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_chat(self) -> ChatClient:
        """Return a ready-to-use chat client for ``config.CHAT_MODEL``."""
        if self._chat_client is None:
            self._chat_model = self._ensure_model_ready(CHAT_MODEL)
            self._chat_client = self._chat_model.get_chat_client()
        return self._chat_client

    def get_embedding(self) -> EmbeddingClient:
        """Return a ready-to-use embedding client for ``config.EMBEDDING_MODEL``."""
        if self._embedding_client is None:
            self._embedding_model = self._ensure_model_ready(EMBEDDING_MODEL)
            self._embedding_client = self._embedding_model.get_embedding_client()
        return self._embedding_client

    @property
    def manager(self) -> FoundryLocalManager:
        """Direct access to the underlying ``FoundryLocalManager``."""
        return self._manager


def get_foundry_manager() -> FoundryManager:
    """Return the global :class:`FoundryManager` singleton (thread-safe)."""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:       # double-checked locking
                _instance = FoundryManager()
    return _instance
