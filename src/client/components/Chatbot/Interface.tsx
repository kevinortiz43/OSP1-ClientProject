import { useState } from "react";
import ChatbotIcon from "./ChatbotIcon";
import { FaArrowDown, FaArrowUp, FaComments } from "react-icons/fa";
import "./interface.css";

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function Interface() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "How can I help you today?",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (error: { preventDefault: () => void }) => {
    error.preventDefault();
    const query = inputValue.trim();
    if (!query || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3000/api/ai-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naturalLanguageQuery: query }),
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "bot", text: data.response }]);
      setIsLoading(false);
    } catch (error) {
      console.log(`${error}`);
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, something went wrong. Please try again." },
      ]);
      setIsLoading(false);
    }
  };

  const toggleChatbot = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="container-chatbot">
      {!isOpen && (
        <button className="chatbot-toggle-btn" onClick={toggleChatbot}>
          <FaComments />
        </button>
      )}

      {isOpen && (
        <div className="chatbot_popup">
          <div className="chat_header">
            <div className="header_info">
              <ChatbotIcon />
              <h2 className="logo_text">Chatbot</h2>
              <button onClick={toggleChatbot}>
                <FaArrowDown />
              </button>
            </div>
          </div>

          <div className="chat-body">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}-message`}>
                {msg.role === "bot" && <ChatbotIcon />}
                <p className="message-text">{msg.text}</p>
              </div>
            ))}
            {isLoading && (
              <div className="message bot-message">
                <ChatbotIcon />
                <p className="message-text">Thinking</p>
              </div>
            )}
          </div>

          <div className="chat-footer">
            <form className="chat-form" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Message..."
                className="message-input"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading}>
                <FaArrowUp />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
