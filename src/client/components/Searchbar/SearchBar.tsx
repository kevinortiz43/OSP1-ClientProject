import "./SearchBar.css";

import MultiSelect from "./MultiSelect";


const SearchBar = () => {
  return (

  <div className="searchbar">
   <input type="text" id="s" placeholder="Search for keywords and filter info from the FAQ and Trust Control..."/>
   <MultiSelect onFilterChange={function (): void {
        throw new Error("Function not implemented.");
      } }/>
  </div>

  )
}

export default SearchBar