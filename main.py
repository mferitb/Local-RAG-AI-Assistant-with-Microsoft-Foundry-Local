"""
main.py — Entry point for the Local RAG Assistant.

Starts a Flask web server that serves the chat UI and exposes
a ``/ask`` API endpoint.  On first launch, initializes the database
and the Foundry Local SDK.
"""

import os
import sys
import logging

from flask import Flask, render_template, request, jsonify

# Ensure the project root is on sys.path so that ``config`` and ``src``
# can be imported regardless of where the user runs the script from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG
from src.db import init_db

# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------

app = Flask(
    __name__,
    template_folder=os.path.join("web", "templates"),
    static_folder=os.path.join("web", "static"),
)


@app.route("/")
def index():
    """Serve the chat UI."""
    return render_template("index.html")


@app.route("/ask", methods=["POST"])
def ask():
    """Receive a question as JSON and return the model's answer.

    Expected request body
    ---------------------
    { "question": "What is ...?" }

    Response
    --------
    { "answer": "The model says ...", "sources": [...] }
    """
    from src.llm import answer_query

    data = request.get_json(force=True)
    question = data.get("question", "").strip()

    if not question:
        return jsonify({"error": "No question provided."}), 400

    try:
        answer = answer_query(question)
        return jsonify({"answer": answer})
    except Exception as e:
        logging.exception("Error answering query")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    """Initialize the database, Foundry Local, and start the Flask server."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    print("Initializing database...")
    init_db()

    print("Initializing Foundry Local SDK...")
    print("  (Models will be downloaded on first use if not cached)")
    from src.foundry_manager import get_foundry_manager
    try:
        manager = get_foundry_manager()
        print("  Foundry Local SDK initialized successfully.")
    except Exception as e:
        print(f"  WARNING: Could not initialize Foundry Local SDK: {e}")
        print("  The server will start, but chat will fail until the SDK is available.")

    print(f"Starting server on http://localhost:{FLASK_PORT}")
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)


if __name__ == "__main__":
    main()
