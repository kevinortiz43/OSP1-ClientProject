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
  category: string;
  searchText: string;
  createdat?: string;
  updatedat?: string;
  updatedBy?: string;
}
interface FaqProps {
  selectedCategories: string[];
}

const Faqs: React.FC<FaqProps> =({ selectedCategories }) => {
  const [faqs, setFaqs] = useState<FAQ[]>([]); 
  const [filteredFaqs, setFilteredFaqs] = useState<FAQ[]>([]); 
  
  const [expandedId, setExpandedId] = useState<string | null>(null); 
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState<string | null>(null); 

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/trustFaqs");
        
        if (!response.ok) throw new Error("Failed to fetch FAQs");

        const infoObj = await response.json();

        setFaqs(infoObj.data);
        setFaqs(infoObj.data); 
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


  useEffect(() => {
    if (selectedCategories.length === 0) {
      setFilteredFaqs(faqs);
    } else {
      const filtered = faqs.filter(faq => 
        selectedCategories.includes(faq.category)
      );
      setFilteredFaqs(filtered);
    }
  }, [selectedCategories, faqs]); 
  
  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) return <div className="faqs_container">Loading FAQs...</div>; 
  
  if (error) return <div className="faqs_container">Error: {error}</div>; 

  return (
    <div className="faqs_container">
      <div className="faqs_header">
        <h1 className="faqs_title">FAQs</h1>
      </div>

      {selectedCategories.length > 0 && filteredFaqs.length === 0 ? (
        <div className="no-results">
          No FAQs match the selected categories.
        </div>
      ) : (
        <div className="faqs_list">
          {filteredFaqs.map((faq) => ( 
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
              {expandedId === faq.id && (
                <div className="faq_answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Faqs;
