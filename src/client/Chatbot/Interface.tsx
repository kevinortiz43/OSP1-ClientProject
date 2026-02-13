import React from "react";
import { useState } from "react";
import ChatbotIcon from "./ChatbotIcon";
import { FaArrowDown, FaArrowUp, FaComments } from "react-icons/fa";
import "./interface.css";

export default function Interface() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChatbot = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="container-chatbot">
      {/* Floating chatbot button */}
      {!isOpen && (
        <button className="chatbot-toggle-btn" onClick={toggleChatbot}>
          <FaComments />
        </button>
      )}

      {/* chatbot popup */}
      {isOpen && (
        <div className="chatbot_popup">
          {/* chatbot header */}
          <div className="chat_header">
            <div className="header_info">
              <ChatbotIcon />
              <h2 className="logo_text">Chatbot</h2>
              <button onClick={toggleChatbot}>
                <FaArrowDown />
              </button>
            </div>
          </div>

          {/* chat body */}
          <div className="chat-body">
            <div className="message bot-message">
              <ChatbotIcon />
              <p className="message-text">
                Hey there 👋 <br /> How can I help you today?
              </p>
            </div>
            <div className="message user-message">
              <p className="message-text">
                Lorem ipsum dolor sit amet consectetur adipisicing.
              </p>
            </div>
          </div>

          {/* chat footer */}
          <div className="chat-footer">
            <form action="#" className="chat-form">
              <input
                type="text"
                placeholder="Message..."
                className="message-input"
                required
              />
              <button type="submit">
                <FaArrowUp />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
