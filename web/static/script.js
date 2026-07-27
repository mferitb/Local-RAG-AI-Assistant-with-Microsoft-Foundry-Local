/**
 * script.js — Client-side logic for the Personal AI Assistant.
 */

document.addEventListener("DOMContentLoaded", () => {
    const form         = document.getElementById("ask-form");
    const input        = document.getElementById("question-input");
    const chatArea     = document.getElementById("chat-area");
    const askButton    = document.getElementById("ask-button");
    const welcomePanel = document.getElementById("welcome-panel");
    const topicBar     = document.getElementById("topic-bar");

    // ── Quick topic chips ──────────────────────────────────────────────
    topicBar.querySelectorAll(".topic-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const question = chip.dataset.q;
            if (question) {
                input.value = question;
                form.requestSubmit();
            }
        });
    });

    // ── Form submit ────────────────────────────────────────────────────
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const question = input.value.trim();
        if (!question) return;

        // Hide welcome panel on first message
        if (welcomePanel && !welcomePanel.classList.contains("hidden")) {
            welcomePanel.classList.add("hidden");
        }

        appendMessage("user", question);
        input.value = "";
        askButton.disabled = true;

        const typingEl = appendTypingIndicator();

        try {
            const response = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });

            const data = await response.json();
            typingEl.remove();

            if (response.ok && data.answer) {
                appendMessage("bot", data.answer);
            } else {
                const errorMsg = data.error || "Something went wrong. Please try again.";
                appendMessage("bot", errorMsg, true);
            }
        } catch (err) {
            typingEl.remove();
            appendMessage("bot", "Could not reach the server. Is it running?", true);
        } finally {
            askButton.disabled = false;
            input.focus();
        }
    });

    // ── Helpers ────────────────────────────────────────────────────────

    /**
     * Append a chat message to the chat area.
     * @param {"user"|"bot"} role
     * @param {string} text
     * @param {boolean} isError
     */
    function appendMessage(role, text, isError = false) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message", role);

        const roleLabel = document.createElement("div");
        roleLabel.classList.add("message-role");
        roleLabel.textContent = role === "user" ? "You" : "Assistant";

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");
        if (isError) bubble.classList.add("error");

        if (role === "bot" && !isError) {
            // Render bot text with basic markdown-lite formatting
            bubble.innerHTML = formatBotResponse(text);
        } else {
            bubble.style.whiteSpace = "pre-wrap";
            bubble.textContent = text;
        }

        wrapper.appendChild(roleLabel);
        wrapper.appendChild(bubble);
        chatArea.appendChild(wrapper);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    /**
     * Convert simple markdown-style patterns to HTML for bot responses.
     * Handles **bold**, numbered lists, and bullet lists.
     * @param {string} text
     * @returns {string} HTML string
     */
    function formatBotResponse(text) {
        // Escape HTML entities first
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // **bold**
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        // Line breaks
        html = html.replace(/\n/g, "<br>");

        return html;
    }

    /**
     * Show a typing indicator in the chat area.
     * @returns {HTMLElement} the wrapper element (so caller can remove it)
     */
    function appendTypingIndicator() {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message", "bot");

        const roleLabel = document.createElement("div");
        roleLabel.classList.add("message-role");
        roleLabel.textContent = "Assistant";

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");
        bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;

        wrapper.appendChild(roleLabel);
        wrapper.appendChild(bubble);
        chatArea.appendChild(wrapper);
        chatArea.scrollTop = chatArea.scrollHeight;

        return wrapper;
    }
});
