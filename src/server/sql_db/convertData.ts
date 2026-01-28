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

let controlsOutput: string;  
let faqsOutput: string;      


export function convertToCSV(): { 
  controls: string; 
  faqs: string;
  counts: { controls: number; faqs: number };
} {

// convert controls to CSV rows
// read 'allTrustControls.json'
// parse JSON
const controls = JSON.parse(fs.readFileSync(dataPath('allTrustControls.json'), 'utf8'));

// Transform: JSON array of edges → CSV rows
// Example input (simplified):
//   edges: [{node: {id: "abc", category: "Security", short: "Test"}}, ...]
// Example output after map/escape:
//   First row: "abc","Security","Test","long text",...

const controlsCSV = controls.data.allTrustControls.edges.map((e: any) => //  create array of field values from current node
  [e.node.id, e.node.category, e.node.short, e.node.long, e.node.createdAt, e.node.createdBy, e.node.updatedAt, e.node.updatedBy]
    .map(escape) //  escape each value for CSV
    .join(',') //  join values with commas: "value1","value2","value3"
).join('\n'); //  join all rows with newlines: row1\nrow2\nrow3


 controlsOutput = 'id,category,short,long,created_at,created_by,updated_at,updated_by\n' + controlsCSV; // header row 'id,category,short,etc.' then data rows (controlsCSV)


  fs.writeFileSync(path.join(__dirname, 'controls.csv'), controlsOutput); // create csv file called 'controls.csv'

// same process as above for 2nd data file
const faqs = JSON.parse(fs.readFileSync(dataPath('allTrustFaqs.json'), 'utf8'));
const faqsCSV = faqs.data.allTrustFaqs.edges.map((e: any) => // map edges to get each node
  [e.node.id, e.node.question, e.node.answer, e.node.createdAt, e.node.createdBy, e.node.updatedAt, e.node.updatedBy]
    .map(escape).join(',') 
).join('\n');

  faqsOutput = 'id,question,answer,created_at,created_by,updated_at,updated_by\n' + faqsCSV;
  
  fs.writeFileSync(path.join(__dirname, 'faqs.csv'), faqsOutput);

console.log('csv files created');

  // return data in an object
  return {
    controls: controlsOutput,  // actual CSV content for controls
    faqs: faqsOutput,          // actual CSV content for FAQs
    counts: {
      controls: controls.data.allTrustControls.edges.length,
      faqs: faqs.data.allTrustFaqs.edges.length
    }
  };
}

  // allows: npm run csv (or) tsx convertData.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = convertToCSV();
  console.log(`Generated: ${result.counts.controls} controls, ${result.counts.faqs} FAQs`);
}