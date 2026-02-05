import React from "react";
import "./App.css";
import AppComponent from "./components/client-components-dropdown";
import allTrustControls from "../server/data/allTrustControls.json";
import allTrustFaqs from "../server/data/allTrustFaqs.json";
import Faqs from "./components/Faqs/Faqs";
import SearchBar from "./components/Searchbar/SearchBar";
import TrustCenter from "./components/TrustCenter/TrustCenter";

export default function App() {
  return (
    <div className="trustFaqs_page">
      <div className="trustFaqs_grid">
        <section className="trustFaqs_col" aria-label="Trust Center">
          <TrustCenter />
        </section>

        <section className="trustFaqs_col" aria-label="FAQs">
          <Faqs />
        </section>
      </div>
    </div>
  );
}
