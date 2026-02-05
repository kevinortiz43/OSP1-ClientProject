// import AsyncSelect from "react-select/async";
import Select from 'react-select';
// import { callbackify } from "util";

const MultiSelect = () => {
  const options = [
    { value: "Organizational Security", label: "Organizational Security" },
    { value: "Cloud Security", label: "Cloud Security" },
    { value:  "Secure Development", label: "Secure Development" },
    { value: "Data Security", label: "Data Security" },
  ];


  const handleChange = (selectedOption) => {
    console.log("handleChange", selectedOption);
  };

  

//   const loadOptions = (searchValue, callback) => {
//     setTimeout(() => {
//       const filteredOptions = options.filter((option) =>
//         option.label.toLowerCase().includes(searchValue.toLowerCase()),
//       );
//       console.log("loadOptions", searchValue, filteredOptions);
//       callback(filteredOptions);
//     }, 2000);
//   };
  return (

    <Select options={options} onChange={handleChange} isMulti />
    // <Select loadOptions={loadOptions} onChange={handleChange} isMulti />
  );
};

export default MultiSelect;

