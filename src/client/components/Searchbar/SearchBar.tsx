import "./SearchBar.css";
import React from "react";
import Select from "react";
import { useState } from "react";
import MultiSelect from "./MultiSelect";


const SearchBar = () => {
  return (

  <div className="searchbar">
   <input type="text" id="s" placeholder="Search for keywords and filter info from the FAQ and Trust Control..."/>
   <MultiSelect/>
  </div>

  )
}

export default SearchBar