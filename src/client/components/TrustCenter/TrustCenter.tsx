import "../../App.css";

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
  searchText: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}


interface TrustCenterProps {
  selectedCategories: string[];
}


const TrustCenter: React.FC<TrustCenterProps> = ({ selectedCategories }) => {
  const [trusts, setTrusts] = useState<Trust[]>([]); 
  const [filteredTrusts, setFilteredTrusts] = useState<Trust[]>([]); 
  const [expandedId, setExpandedId] = useState<string | null>(null); 
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState<string | null>(null); 

  useEffect(() => {
    const fetchTrusts = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/trustControls");

        if (!response.ok) throw new Error("Failed to fetch Trust Controls");

        const infoObj = await response.json();

        console.log("infoObj: ", infoObj);


        setTrusts(infoObj.data);
        setFilteredTrusts(infoObj.data); 
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

  useEffect(() => {
    if (selectedCategories.length === 0) {
      setFilteredTrusts(trusts); 
    } else {
      const filtered = trusts.filter(trust => 
        selectedCategories.includes(trust.category)
      );
      setFilteredTrusts(filtered);
    }
  }, [selectedCategories, trusts]); 
  const toggleTrust = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading)
    return <div className="trusts_container">Loading Trust Controls...</div>; 
  if (error) return <div className="trusts_container">Error: {error}</div>; 
  
  return (
    <div className="trusts_container">
      <div className="trusts_header">
        <h1 className="trusts_title">Trust Controls</h1>
      </div>

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