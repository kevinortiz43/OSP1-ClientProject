import { useEffect, useState } from "react";
import "./App.css";
import Faqs from "./components/Faqs/Faqs";
import TrustCenter from "./components/TrustCenter/TrustCenter";
import "./components/darktheme.css";
import MultiSelect from "./components/Searchbar/MultiSelect";
import Interface from "./components/Chatbot/Interface";
import ArchitectureDiagram from "./components/ArchitectureDiagram/ArchitectureDiagram";
export default function App() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleFilterChange = (categories: string[]) => {
    setSelectedCategories(categories);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

    const applyTheme = (isDark: boolean) => {
      document.documentElement.setAttribute(
        "data-theme",
        isDark ? "dark" : "light",
      );
    };

    applyTheme(Boolean(mediaQuery?.matches));
    const onChange = (event: MediaQueryListEvent) => applyTheme(event.matches);

    if (mediaQuery?.addEventListener)
      mediaQuery.addEventListener("change", onChange);
    return () => {
      if (mediaQuery?.removeEventListener)
        mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  if (
    typeof window !== "undefined" &&
    window.location.pathname === "/diagram-onlineAI"
  ) {
    return <ArchitectureDiagram />;
  }

  return (
    <div className="trustFaqs_page">
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
