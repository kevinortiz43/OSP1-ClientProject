// import "../App.css";
import React from "react";
import { useState } from "react";
//import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
//import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

const Faqs = () => { 
  return (
    <div className="faqs_container">
      <div className="faqs_row">
        <h1 className="title">Frequently Asked Questions</h1>
        <h2 className="sub_paragraph">
          Find answers to most common asked questions on our platform
        </h2>
        <p>
          <strong> what do you need help with?</strong>
          <h4>
            {/* <FontAwesomeIcon icon={faCircleInfo} /> */}
            Search bar
          </h4>
        </p>
        <br />
        <p>
          <strong>Are my info secure</strong>
        </p>
        <br />
        <h4>Yes</h4>
      </div>
    </div>
  );
};

export default Faqs;
