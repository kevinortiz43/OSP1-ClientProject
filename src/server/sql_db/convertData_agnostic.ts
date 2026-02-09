import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Parser } from '@json2csv/plainjs';

// OS-agnostic path handling
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = (file: string) => path.join(__dirname, "..", "data", file);

// OPTION 1: using json2csv module
export async function convertRelayJSONToCSV(
  filename: string
): Promise<{ csvContent: string; recordCount: number; headers: string[] }> {
  // OS-agnostic file reading with explicit encoding
  const filePath = dataDir(filename);
  const fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
  const parsedFile = JSON.parse(fileContent);
  
  // extract Relay structure
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
  const parser = new Parser({ fields });
  const csvContent = parser.parse(nodes);
  
  return {
    csvContent,
    recordCount: edges.length,
    headers: fields,
  };
}

// convert all JSON files
export async function convertAllJSONFilesInDataFolder(): Promise<Record<string, any>> {
  console.log(`\nConverting all JSON files using json2csv module...`);

  const results: Record<string, any> = {};

  try {
    // OS-agnostic path joining
    const dataFolderPath = path.join(__dirname, "..", "data");
    
    // Check if data folder exists
    if (!fs.existsSync(dataFolderPath)) {
      console.log(`Data folder not found: ${dataFolderPath}`);
      return results;
    }

    const files = fs.readdirSync(dataFolderPath);
    const jsonFiles = files.filter((file) => 
      file.toLowerCase().endsWith(".json") || 
      path.extname(file).toLowerCase() === ".json"
    );

    if (jsonFiles.length === 0) {
      console.log("No JSON files found");
      return results;
    }
    
    console.log(`Found ${jsonFiles.length} JSON files: ${jsonFiles.join(", ")}`);

    for (const file of jsonFiles) {
      try {
        const result = await convertRelayJSONToCSV(file);
        
        console.log(`Processing ${file}...`);

        // OS-agnostic file extension replacement
        const csvFilename = path.basename(file, ".json") + ".csv";
        const csvFilePath = dataDir(csvFilename);
        
        // Write with explicit encoding
        fs.writeFileSync(csvFilePath, result.csvContent, { encoding: "utf8" });

        results[file] = {
          csvFilename,
          recordCount: result.recordCount,
          headers: result.headers,
          csvFilePath: path.resolve(csvFilePath) // Full resolved path
        };

        console.log(`Created ${csvFilename} with ${result.recordCount} records at ${csvFilePath}`);
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
  if (typeof process === 'undefined') {
    // Not Node.js environment
    return false;
  }
  
  if (!process.argv || process.argv.length < 1) {
    return false;
  }
  
  // Compare current file with the first argument
  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1];
  
  // Normalize paths for comparison across platforms
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
          console.log(`  ${file}: ${info.recordCount} records -> ${info.csvFilename}`);
        }
      });
    })
    .catch((error) => {
      console.error("Conversion failed:", error);
      process.exit(1);
    });
}