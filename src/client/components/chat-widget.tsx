import React, { useEffect, useMemo, useRef, useState } from "react";
import "./chat-widget.css";
type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
};

type ChatWidgetProps = {
  title?: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Mock chat widget UI.
 * - No HTTP requests yet (intentionally)
 * - Keeps messages in local component state
 * - Fixed-size panel intended to be placed inside a fixed bottom bar
 */
const ChatWidget: React.FC<ChatWidgetProps> = ({ title = "Chat" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: makeId(),
      role: "assistant",
      text: "Hi — I’m a mock chat widget. Your chatbot HTTP request will go here later.",
      createdAt: Date.now(),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [isOpen, messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      text,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");

    const assistantMsg: ChatMessage = {
      id: makeId(),
      role: "assistant",
      text: "Mock reply (replace with HTTP chatbot response).",
      createdAt: Date.now(),
    };

    window.setTimeout(() => {
      setMessages((prev) => [...prev, assistantMsg]);
    }, 350);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chatWidgetShell" aria-label="Chat widget">
      {!isOpen ? (
        <button
          type="button"
          className="chatWidgetFab"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
        >
          Chat
        </button>
      ) : (
        <div className="chatWidgetPanel" role="dialog" aria-label={title}>
          <div className="chatWidgetHeader">
            <div className="chatWidgetTitle">{title}</div>
            <button
              type="button"
              className="chatWidgetIconButton"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="chatWidgetBody" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chatBubbleRow ${
                  m.role === "user" ? "isUser" : "isAssistant"
                }`}
              >
                <div className="chatBubble" aria-label={m.role}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="chatWidgetComposer">
            <input
              className="chatWidgetInput"
              value={draft}
              placeholder="Type a message…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Message"
            />
            <button
              type="button"
              className="chatWidgetSend"
              onClick={send}
              disabled={!canSend}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget;