// import "../App.css";
import React from "react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

const SearchBar = () => {
  return (

  <div className="searchbar">
   <input type="text" id="s" placeholder="Search for keywords and filter info from the FAQ and Trust Control..."></input>
  </div>

  )
}

export default SearchBar