"""
test_hello_model.py — Smoke test for the Foundry Local SDK setup.

Run with:
    python tests/test_hello_model.py

This script:
1. Imports the Foundry Local SDK.
2. Initializes the manager and lists available models.
3. Starts the OpenAI-compatible web service.
4. Sends a simple prompt to the chat model and prints the response.

If this script runs without errors, your Foundry Local installation is
correctly configured and the model is accessible.
"""

import sys
import os

# Ensure the project root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import CHAT_MODEL


def test_foundry_local_setup():
    """Verify that Foundry Local is reachable and the chat model responds."""
    try:
        from foundry_local_sdk import FoundryLocalManager, Configuration
    except ImportError:
        print(
            "ERROR: foundry-local-sdk is not installed.\n"
            "Run: pip install foundry-local-sdk"
        )
        sys.exit(1)

    print("=" * 60)
    print("Foundry Local SDK — Setup Verification")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Initialize the manager
    # ------------------------------------------------------------------
    print("\n[1/4] Initializing FoundryLocalManager...")
    try:
        config = Configuration(app_name="local-rag-assistant-test")
        FoundryLocalManager.initialize(config)
        manager = FoundryLocalManager.instance
        print("  Manager initialized successfully.")
    except Exception as exc:
        print(f"  ERROR: Could not initialize FoundryLocalManager — {exc}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: List available models
    # ------------------------------------------------------------------
    print("\n[2/4] Listing available models...")
    try:
        models = manager.catalog.list_models()
        print(f"  Found {len(models)} model(s) in the catalog.")
        for m in models[:10]:  # Show at most 10
            print(f"    - {m.alias}")
    except Exception as exc:
        print(f"  WARNING: Could not list models — {exc}")

    # ------------------------------------------------------------------
    # Step 3: Start the OpenAI-compatible web service
    # ------------------------------------------------------------------
    print("\n[3/4] Starting the web service...")
    try:
        manager.start_web_service()
        base_url = manager.urls[0] if manager.urls else None
        print(f"  Web service running at: {base_url}")
    except Exception as exc:
        print(f"  ERROR: Could not start web service — {exc}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 4: Send a test prompt via the OpenAI client
    # ------------------------------------------------------------------
    print(f"\n[4/4] Sending test prompt to model '{CHAT_MODEL}'...")
    test_prompt = "Hello! Please respond with a single sentence to confirm you are working."

    try:
        from openai import OpenAI

        client = OpenAI(base_url=f"{base_url}/v1", api_key="foundry-local")
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "user", "content": test_prompt},
            ],
        )
        answer = response.choices[0].message.content
        print(f"  Model response: {answer}")
    except Exception as exc:
        print(f"  ERROR: Chat completion failed — {exc}")
        sys.exit(1)
    finally:
        # Clean up the web service
        try:
            manager.stop_web_service()
            print("  Web service stopped.")
        except Exception:
            pass

    print("\n" + "=" * 60)
    print("SUCCESS: Foundry Local is set up correctly!")
    print("=" * 60)


if __name__ == "__main__":
    test_foundry_local_setup()
