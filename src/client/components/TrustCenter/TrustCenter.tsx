import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleQuestion,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import "./TrustCenter.css";

interface Trust {
  id: string;
  category: string;
  short: string;
  long: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}


interface TrustCenterProps {
  selectedCategories: string[];
}


// pass down selectedCategories from parent App.tsx
const TrustCenter: React.FC<TrustCenterProps> = ({ selectedCategories }) => {
  const [trusts, setTrusts] = useState<Trust[]>([]); //state to hold fetched Trust Controls
  const [filteredTrusts, setFilteredTrusts] = useState<Trust[]>([]); // state to filter Trusts list
  const [expandedId, setExpandedId] = useState<string | null>(null); //state to track expanded Trust Control (starts as null)
  const [loading, setLoading] = useState(true); //state to track loading status (starts as true)
  const [error, setError] = useState<string | null>(null); //state to track error status (starts as null which means no error)

// fetch all data on component mount
  useEffect(() => {
    const fetchTrusts = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/trustControls");
        // console.log('Fetching Trust Controls from API:', response);
        if (!response.ok) throw new Error("Failed to fetch Trust Controls");

        const data = await response.json();
        setTrusts(data);
        setFilteredTrusts(data); // init with all data
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

    fetchTrusts();
  }, []);

  // filter trusts when selectedCategories change
  useEffect(() => {
    if (selectedCategories.length === 0) {
      setFilteredTrusts(trusts); // show all if no filters
    } else {
      const filtered = trusts.filter(trust => 
        selectedCategories.includes(trust.category)
      );
      setFilteredTrusts(filtered);
    }
  }, [selectedCategories, trusts]); // re-run when filters or data changes

  //when clicking on Trust Control, toggle its expanded state
  const toggleTrust = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading)
    return <div className="trusts_container">Loading Trust Controls...</div>; //conditional render loading state
  if (error) return <div className="trusts_container">Error: {error}</div>; //conditional render error state

  return (
    <div className="trusts_container">
      <div className="trusts_header">
        <h1 className="trusts_title">Trust Center</h1>
        <p className="trusts_subtitle">
          Find answers to common questions about our platform
        </p>
      </div>

           {/* Show filter status */}
      {selectedCategories.length > 0 && filteredTrusts.length === 0 ? (
        <div className="no-results">
          No Trust Controls match the selected categories.
        </div>
      ) : (
        <div className="trusts_list">
          {filteredTrusts.map((trust) => (
            <div key={trust.id} className="trust_card">
              <button
                className={`trust_button ${expandedId === trust.id ? "active" : ""}`}
                onClick={() => toggleTrust(trust.id)}
                aria-expanded={expandedId === trust.id}
              >
                <div className="trust_header">
                  <div className="trust_icon_wrapper">
                    <FontAwesomeIcon
                      icon={faCircleQuestion}
                      className="trust_icon"
                    />
                  </div>
                  <div className="trust_text">
                    <h3 className="trust_question">{trust.short}</h3>
                    {/* Optional: Show category tag */}
                    <span className="trust-category">{trust.category}</span>
                  </div>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`trust_chevron ${expandedId === trust.id ? "rotated" : ""}`}
                  />
                </div>
              </button>
              {expandedId === trust.id && (
                <div className="trust_answer">
                  <p>{trust.long}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrustCenter;
