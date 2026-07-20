/**
 * script.js — Client-side logic for the Local RAG Assistant.
 *
 * Sends the user's question to the /ask endpoint via fetch(),
 * and renders both the question and the answer in the chat area
 * without a full-page reload.
 */

document.addEventListener("DOMContentLoaded", () => {
    const form        = document.getElementById("ask-form");
    const input       = document.getElementById("question-input");
    const chatArea    = document.getElementById("chat-area");
    const askButton   = document.getElementById("ask-button");
    const welcome     = document.getElementById("welcome-message");
    const statusBadge = document.getElementById("status-badge");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const question = input.value.trim();
        if (!question) return;

        // Hide welcome message on first interaction
        if (welcome) {
            welcome.style.display = "none";
        }

        // Append the user's message bubble
        appendMessage("user", question);
        input.value = "";
        askButton.disabled = true;
        setStatus("Thinking...", "loading");

        // Show typing indicator
        const typingEl = appendTypingIndicator();

        try {
            const response = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });

            const data = await response.json();

            // Remove typing indicator
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
            setStatus("Ready", "ready");
            input.focus();
        }
    });

    /**
     * Append a chat bubble to the chat area.
     * @param {"user"|"bot"} role
     * @param {string} text
     * @param {boolean} isError
     */
    function appendMessage(role, text, isError = false) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message", role);

        const avatar = document.createElement("div");
        avatar.classList.add("message-avatar");
        avatar.textContent = role === "user" ? "You" : "AI";

        const content = document.createElement("div");
        content.classList.add("message-content");
        if (isError) content.classList.add("error-text");
        content.textContent = text;

        wrapper.appendChild(avatar);
        wrapper.appendChild(content);
        chatArea.appendChild(wrapper);

        // Auto-scroll to the latest message
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    /**
     * Show a typing indicator and return the DOM element so the
     * caller can remove it later.
     */
    function appendTypingIndicator() {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message", "bot");

        const avatar = document.createElement("div");
        avatar.classList.add("message-avatar");
        avatar.textContent = "AI";

        const content = document.createElement("div");
        content.classList.add("message-content");
        content.innerHTML = `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        `;

        wrapper.appendChild(avatar);
        wrapper.appendChild(content);
        chatArea.appendChild(wrapper);
        chatArea.scrollTop = chatArea.scrollHeight;

        return wrapper;
    }

    /**
     * Update the status badge in the header.
     * @param {string} text
     * @param {"ready"|"loading"} state
     */
    function setStatus(text, state) {
        statusBadge.innerHTML = `<span class="status-dot"></span> ${text}`;
        if (state === "loading") {
            statusBadge.style.color = "#facc15";
            statusBadge.style.borderColor = "rgba(250, 204, 21, 0.2)";
            statusBadge.style.background = "rgba(250, 204, 21, 0.08)";
        } else {
            statusBadge.style.color = "";
            statusBadge.style.borderColor = "";
            statusBadge.style.background = "";
        }
    }
});
