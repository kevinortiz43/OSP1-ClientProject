// import React from "react";
// import { useState } from "react";
// import ChatbotIcon from "./ChatbotIcon";
// import { FaArrowDown, FaArrowUp, FaComments } from "react-icons/fa";
// import "./interface.css";

// export default function Interface() {
//   const [isOpen, setIsOpen] = useState(false);

//   const toggleChatbot = () => {
//     setIsOpen(!isOpen);
//   };

//   return (
//     <div className="container-chatbot">
//       {/* Floating chatbot button */}
//       {!isOpen && (
//         <button className="chatbot-toggle-btn" onClick={toggleChatbot}>
//           <FaComments />
//         </button>
//       )}

//       {/* chatbot popup */}
//       {isOpen && (
//         <div className="chatbot_popup">
//           {/* chatbot header */}
//           <div className="chat_header">
//             <div className="header_info">
//               <ChatbotIcon />
//               <h2 className="logo_text">Chatbot</h2>
//               <button onClick={toggleChatbot}>
//                 <FaArrowDown />
//               </button>
//             </div>
//           </div>

//           {/* chat body */}
//           <div className="chat-body">
//             <div className="message bot-message">
//               <ChatbotIcon />
//               <p className="message-text">
//                 Hey there 👋 <br /> How can I help you today?
//               </p>
//             </div>
//             <div className="message user-message">
//               <p className="message-text">
//                 Lorem ipsum dolor sit amet consectetur adipisicing.
//               </p>
//             </div>
//           </div>

//           {/* chat footer */}
//           <div className="chat-footer">
//             <form action="#" className="chat-form">
//               <input
//                 type="text"
//                 placeholder="Message..."
//                 className="message-input"
//                 required
//               />
//               <button type="submit">
//                 <FaArrowUp />
//               </button>
//             </form>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

import React from "react";
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
      text: "Hey there 👋 How can I help you today?",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3000/api/ai-online", {
        method: "POST",
        headers: { "Content-Type": " application/json" },
        body: JSON.stringify({ naturalLanguageQuery: query }),
      });
      console.log(`${response.body}`);
      if (!response.ok) throw new Error("Server error");

      await response.json();
      console.log(`RESPONSE RESPONSE RESPONSE ${response}`);
      // on the response text should be switched to whatever the response from
      // doing a post request to localhost:3000/api/ai-online
      // { role: "bot", text: `${response}` },
      setMessages((prev) => [
        ...prev,

        { role: "bot", text: "Got your results!" },
      ]);
      setIsLoading(false);
    } catch (err) {
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

          {/* chat footer */}
          <div className="chat-footer">
            <form className="chat-form" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Message..."
                className="message-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
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
