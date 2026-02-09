import Select from 'react-select';


interface MultiSelectProps {
  onFilterChange: (selectedCategories: string[]) => void;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ onFilterChange }) => { //pass in onFilterChange prop
  const options = [
    { value: "Organizational Security", label: "Organizational Security" },
    { value: "Cloud Security", label: "Cloud Security" },
    { value:  "Secure Development", label: "Secure Development" },
    { value: "Data Security", label: "Data Security" },
  ];


  const handleChange = (selectedOptions) => { // if selectedOptions exists, then map them, if not then empty arr
    const selectedValues = selectedOptions ? selectedOptions.map(opt => opt.value) : [];
    onFilterChange(selectedValues);
  };
  

  return (
    <div className="searchbar" >
    <Select options={options} onChange={handleChange} isMulti placeholder="Filter results by category" />
    </div>
  );
};

export default MultiSelect;
