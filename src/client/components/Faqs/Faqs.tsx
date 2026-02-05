import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleQuestion,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import "./Faqs.css";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  createdat?: string;
  updatedat?: string;
}

const Faqs = () => {
  const [faqs, setFaqs] = useState<FAQ[]>([]); //state to hold fetched FAQs
  const [expandedId, setExpandedId] = useState<string | null>(null); //state to track expanded FAQ (starts as null)
  const [loading, setLoading] = useState(true); //state to track loading status (starts as true)
  const [error, setError] = useState<string | null>(null); //state to track error status (starts as null which means no error)

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/trustFaqs");
        // console.log('Fetching FAQs from API:', response);
        if (!response.ok) throw new Error("Failed to fetch FAQs");

        const data = await response.json();
        setFaqs(data);
        setLoading(false);
      } catch (err) {
        if (err && err.message) {
          setError(err.message);
        } else {
          setError("An error occurred");
        }
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  //when clicking on FAQ, toggle its expanded state
  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) return <div className="faqs_container">Loading FAQs...</div>; //conditional render loading state
  if (error) return <div className="faqs_container">Error: {error}</div>; //conditional render error state

  return (
    <div className="faqs_container">
      <div className="faqs_header">
        <h1 className="faqs_title">Frequently Asked Questions</h1>
        <p className="faqs_subtitle">
          Find answers to common questions about our platform
        </p>
      </div>

      <div className="faqs_list">
        {faqs.map((faq) => (
          <div key={faq.id} className="faq_card">
            <button
              className={`faq_button ${expandedId === faq.id ? "active" : ""}`}
              onClick={() => toggleFaq(faq.id)}
              aria-expanded={expandedId === faq.id}
            >
              <div className="faq_header">
                <div className="faq_icon_wrapper">
                  <FontAwesomeIcon
                    icon={faCircleQuestion}
                    className="faq_icon"
                  />
                </div>
                <div className="faq_text">
                  <h3 className="faq_question">{faq.question}</h3>
                </div>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`faq_chevron ${expandedId === faq.id ? "rotated" : ""}`}
                />
              </div>
            </button>
            {/* conditional rendering if true show answer */}
            {expandedId === faq.id && (
              <div className="faq_answer">
                <p>{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Faqs;
