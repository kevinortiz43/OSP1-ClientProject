import React, { useState } from "react";
import "./App.css";
import AppComponent from "./components/client-components-dropdown";
import allTrustControls from "../server/data/allTrustControls.json";
import allTrustFaqs from "../server/data/allTrustFaqs.json";
import Faqs from "./components/Faqs/Faqs";
import SearchBar from "./components/Searchbar/SearchBar";
import TrustCenter from "./components/TrustCenter/TrustCenter";
import MultiSelect from "./components/Searchbar/MultiSelect";
import Interface from "./components/Chatbot/Interface";

export default function App() {
  // track selected categories - managed at App level
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // handler for filter changes from MultiSelect
  const handleFilterChange = (categories: string[]) => {
    setSelectedCategories(categories);
  };

  return (
    <div className="trustFaqs_page">
      {/* <SearchBar /> */}
      <MultiSelect onFilterChange={handleFilterChange} />

      <div className="trustFaqs_grid">
        <section className="trustFaqs_col" aria-label="Trust Center">
          <TrustCenter selectedCategories={selectedCategories} />
        </section>
        <section className="trustFaqs_col" aria-label="FAQs">
          <Faqs selectedCategories={selectedCategories} />
        </section>
        <Interface />
      </div>
    </div>
  );
}
