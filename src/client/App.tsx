import React, { useEffect,  useState  } from "react";
import "./App.css";
import "./components/darktheme.css";
import AppComponent from "./components/client-components-dropdown";
import allTrustControls from "../server/data/allTrustControls.json";
import allTrustFaqs from "../server/data/allTrustFaqs.json";
import Faqs from "./components/Faqs/Faqs";
import SearchBar from "./components/Searchbar/SearchBar";
import TrustCenter from "./components/TrustCenter/TrustCenter";
import MultiSelect from "./components/Searchbar/MultiSelect";
import Interface from "./Chatbot/Interface";

export default function App() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const handleFilterChange = (categories: string[]) => {
    setSelectedCategories(categories);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");

    const applyTheme = (isDark: boolean) => {
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    };

    applyTheme(Boolean(mq?.matches));
    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches);

    if (mq?.addEventListener) mq.addEventListener("change", onChange);
    return () => {
      if (mq?.removeEventListener) mq.removeEventListener("change", onChange);
    };
  }, []);

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
      </div>
      <Interface />
    </div>
  );
}
