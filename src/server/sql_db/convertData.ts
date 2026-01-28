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
fs.writeFileSync(path.join(__dirname, 'controls.csv'), 'id,category,short,long,created_at,created_by,updated_at,updated_by\n' + controlsCSV); // create new file called 'controls.csv' with header row 'id,category,short,etc.' then data rows (controlsCSV)

// same process as above for 2nd data file
const faqs = JSON.parse(fs.readFileSync(dataPath('allTrustFaqs.json'), 'utf8'));
const faqsCSV = faqs.data.allTrustFaqs.edges.map((e: any) => // map edges to get each node
  [e.node.id, e.node.question, e.node.answer, e.node.createdAt, e.node.createdBy, e.node.updatedAt, e.node.updatedBy]
    .map(escape).join(',') 
).join('\n');
fs.writeFileSync(path.join(__dirname, 'faqs.csv'), 'id,question,answer,created_at,created_by,updated_at,updated_by\n' + faqsCSV);

console.log('CSV files created!');