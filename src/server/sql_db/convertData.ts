import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // get current directory where this script file is located
const dataPath = (file: string) => path.join(__dirname, '../data', file); // helper to build path to raw data files in /data folder
const escape = (str: any) => str ? `"${String(str).replace(/"/g, '""')}"` : '';

// CSV escaping function:
// - If string has value: wrap in quotes and escape existing quotes by doubling them
// - If string is null/undefined: return empty string
// Examples: 
//   escape('Hello "World"') → '"Hello ""World"""'
//   escape('Text with, comma') → '"Text with, comma"'
//   escape(null) → ''

// generic conversion function // ASSUME data is in Relay format
export function convertRelayJSONToCSV(filename: string): {
  csvContent: string;
  recordCount: number;
  headers: string[];
} {
  // read and parse JSON file
  const data = JSON.parse(fs.readFileSync(dataPath(filename), 'utf8'));
  
  // dynamically find edges array in relay-like structure
  // Example: data.allTrustControls.edges or data.allTrustFaqs.edges
  const topLevelKeys = Object.keys(data.data || {});
  if (topLevelKeys.length === 0) {
    throw new Error(`No data found in ${filename}`);
  }
  
  // get 1st top-level key (e.g., "allTrustControls" or "allTrustFaqs")
  const dataKey = topLevelKeys[0];
  const edges = data.data[dataKey].edges;
  
  // check to make sure there ARE edges
  if (!edges || edges.length === 0) {
    throw new Error(`No edges found in ${filename}`);
  }
  
  // get 1st node to discover fields dynamically
  const firstNode = edges[0].node; // only 1st node (assumes all other nodes have SAME fields)
  const fields = Object.keys(firstNode);
  
  // Transform: JSON array of edges → CSV rows
  // Example input (simplified):
  //   edges: [{node: {id: "abc", category: "Security", short: "Test"}}, ...]
  // Example output after map/escape:
  //   First row: "abc","Security","Test","long text",...
  
  const csvRows = edges.map((e: any) => // create array of field values from current node
    fields.map(field => e.node[field]) // get values for all fields
      .map(escape) // escape each value for CSV
      .join(',') // join values with commas: "value1","value2","value3"
  ).join('\n'); // join all rows with newlines: row1\nrow2\nrow3
  
  const csvContent = fields.join(',') + '\n' + csvRows; // header row + data rows
  
  return {
    csvContent,
    recordCount: edges.length,
    headers: fields
  };
}

// // main function (keeps your original API)
// export function convertToCSV(): { 
//   controls: string; 
//   faqs: string;
//   counts: { controls: number; faqs: number };
// } {
//   // Convert controls using generic function
//   const controlsResult = convertRelayJSONToCSV('allTrustControls.json');
//   fs.writeFileSync(path.join(__dirname, 'controls.csv'), controlsResult.csvContent);
  
//   // Convert FAQs using generic function
//   const faqsResult = convertRelayJSONToCSV('allTrustFaqs.json');
//   fs.writeFileSync(path.join(__dirname, 'faqs.csv'), faqsResult.csvContent);

//   console.log('CSV files created!');
//   console.log(`  controls.csv: ${controlsResult.recordCount} records, headers: ${controlsResult.headers.join(', ')}`);
//   console.log(`  faqs.csv: ${faqsResult.recordCount} records, headers: ${faqsResult.headers.join(', ')}`);

//   // return data in an object
//   return {
//     controls: controlsResult.csvContent,
//     faqs: faqsResult.csvContent,
//     counts: {
//       controls: controlsResult.recordCount,
//       faqs: faqsResult.recordCount
//     }
//   };
// }

// convert ALL JSON files in data folder 
export function convertAllJSONFilesInDataFolder(): Record<string, any> {
  console.log('find all JSON files in data folder...');
  
  const results: Record<string, any> = {}; // innit empty obj
  
  try {
    // read all files in data folder
    const files = fs.readdirSync(path.join(__dirname, '../data'));
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} JSON files: ${jsonFiles.join(', ')}`);
    
    for (const file of jsonFiles) {
      try {
        console.log(`\nProcessing ${file}...`);
        const result = convertRelayJSONToCSV(file); // get result for EACH file
        
        // Create CSV filename (same name but .csv instead of .json)
        const csvFilename = file.replace('.json', '.csv');
        fs.writeFileSync(path.join(__dirname, csvFilename), result.csvContent);
        
        results[file] = { // get metadata for each converted file
          csvFilename,
          recordCount: result.recordCount,
          headers: result.headers
        };
        
        console.log(`Created ${csvFilename} with ${result.recordCount} records`);
      } catch (error: any) {
        console.log(`Skipped ${file}: ${error.message}`);
      }
    }
    
    return results;
  } catch (error: any) {
    console.error(`Error reading data folder: ${error.message}`);
    return results;
  }
}

// mke it runnable as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {


// We can choose which function to run:
  // Option 1: Run the original convertToCSV (specific files)
  // const result = convertToCSV();
  // console.log(`Generated: ${result.counts.controls} controls, ${result.counts.faqs} FAQs`);
  
  // Option 2: Run the new generic function (all JSON files)
  const results = convertAllJSONFilesInDataFolder();
  console.log(`Done! Processed ${Object.keys(results).length} files.`);
}