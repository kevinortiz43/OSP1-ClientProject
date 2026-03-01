import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Parser } from "@json2csv/plainjs";
// use json2csv module: https://www.npmjs.com/package/@json2csv/plainjs 
// Dynamic Data Conversion: This script handles GraphQL Relay-style JSON responses, converts them to CSV format, and can be used as standalone CLI tool.
// LIMITATIONS: works only with relatively flat Relay-like JSON data, NOT deeply nested, complex data.

const __dirname = path.dirname(fileURLToPath(import.meta.url)); 
const dataDir = (file: string) => path.join(__dirname, "..", "data", file); 


export async function convertRelayJSONToCSV(
  filename: string,
): Promise<{ csvContent: string; recordCount: number; headers: string[] }> {

  // OS-agnostic file reading with explicit encoding to read and parse each JSON file
  const filePath = dataDir(filename);
  const fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
  const parsedFile = JSON.parse(fileContent);

  // dynamically find edges array in relay-like structure
  const topLevelKeys = Object.keys(parsedFile.data || {}); 

  if (topLevelKeys.length === 0) {
    throw new Error(`No data found in ${filename}`);
  }

  const dataKey = topLevelKeys[0]; 
  const edges = parsedFile.data[dataKey].edges; 

  if (!edges || edges.length === 0) {
    throw new Error(`No edges found in ${filename}`);
  }

  // extract nodes from edges
  const nodes = edges.map((edge: any) => edge.node);
  const fields = Object.keys(nodes[0]); 

  // use json2csv to parse
  // {fields} option defaults to top-level JSON attributes (auto-detection)
  // parser auto-identifies keys present in root of input JSON objs and uses them as CSV column headers
  const parser = new Parser({ fields });
  const csvContent = parser.parse(nodes); // parse nodes into CSV string

  // return parsed nodes (CSV string), edges count, column headers
  return {
    csvContent,
    recordCount: edges.length,
    headers: fields,
  };
}

// convert all JSON files
export async function convertAllJSONFilesInDataFolder(): Promise<
  Record<string, any>
> {
  console.log(`\nConverting all JSON files using json2csv module...`);

  const results: Record<string, any> = {}; // store processing results for each file

  try {
    const dataFolderPath = path.join(__dirname, "..", "data");

    if (!fs.existsSync(dataFolderPath)) {
      console.log(`Data folder not found: ${dataFolderPath}`);
      return results; 
    }

  // read all files in the data folder synchronously
 // filter for JSON files:
    // 1. Check file ext (case-insensitive)
    // 2. Use path.extname() for cross-platform compatibility
    const files = fs.readdirSync(dataFolderPath);
    const jsonFiles = files.filter(
      (file) =>
        file.toLowerCase().endsWith(".json") ||
        path.extname(file).toLowerCase() === ".json",
    );

  // check if no JSON files found
    if (jsonFiles.length === 0) {
      console.log("No JSON files found");
      return results;
    }

    console.log(
      `Found ${jsonFiles.length} JSON files: ${jsonFiles.join(", ")}`,
    );

 // process each JSON file
    for (const file of jsonFiles) {
      try {
// convert current JSON file to CSV 
        const result = await convertRelayJSONToCSV(file);

        console.log(`Processing ${file}...`);

 // generate CSV filename by replacing .json extension with .csv
 // Use path.basename() instead of replace() to crrectly id filename ext
        const csvFilename = path.basename(file, ".json") + ".csv";
        const csvFilePath = dataDir(csvFilename);

 // write with explicit encoding
        fs.writeFileSync(csvFilePath, result.csvContent, { encoding: "utf8" });
   
        // store results for each CSV file:
        results[file] = {
          csvFilename, 
          recordCount: result.recordCount, // number of records (rows) in the CSV
          headers: result.headers, // CSV column headers
          csvFilePath: path.resolve(csvFilePath), // full resolved path
        };

        console.log(
          `Created ${csvFilename} with ${result.recordCount} records at ${csvFilePath}`,
        );
      } catch (error: any) {
        console.log(`Skipped ${file}: ${error.message}`);
        results[file] = { error: error.message };
      }
    }

    return results;
  } catch (error: any) {
    console.error(`Error reading data folder: ${error.message}`);
    return results;
  }
}

// OS-agnostic standalone script detection
const isMainModule = () => {
  if (typeof process === "undefined") { // check that we're in Node environment
    return false;
  }

  if (!process.argv || process.argv.length < 1) { // process.argv is an array containing command-line arguments, needs to contain at least 1 argument
    // For ex, process.argv[0] should contain Node.js executable path
    return false;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1]; 

  // path.resolve() Resolves relative paths to absolute paths, normalizes path separators (solves path differences in Windows, Linux, Mac) 
  // normalize paths for comparison across platforms (script will ONLY run if these paths are equal)
  return path.resolve(currentFile) === path.resolve(mainFile);
};

// standalone script execution
if (isMainModule()) {
  convertAllJSONFilesInDataFolder()
    .then((results) => {
      console.log(`\nProcessed ${Object.keys(results).length} files.`);
      console.log("Results summary:");
      Object.entries(results).forEach(([file, info]) => {
        if (info.error) {
          console.log(`  ${file}: ERROR - ${info.error}`);
        } else {
          console.log(
            `  ${file}: ${info.recordCount} records -> ${info.csvFilename}`,
          );
        }
      });
    })
    .catch((error) => {
      console.error("Conversion failed:", error);
      process.exit(1);
    });
}