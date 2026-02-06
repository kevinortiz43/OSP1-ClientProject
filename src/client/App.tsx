import React from "react";
import "./App.css";
import AppComponent from "./components/client-components-dropdown";
import allTrustControls from "../server/data/allTrustControls.json";
import allTrustFaqs from "../server/data/allTrustFaqs.json";
import Faqs from "./components/Faqs/Faqs";
import SearchBar from "./components/Searchbar/SearchBar";

export default function App() {
  return (
    <>
      <SearchBar></SearchBar>
      <AppComponent />/
      <Faqs></Faqs>
    </>
  );
}
