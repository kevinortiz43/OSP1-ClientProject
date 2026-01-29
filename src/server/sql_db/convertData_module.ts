import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Parser } from '@json2csv/plainjs'; // requires package

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = (file: string) => path.join(__dirname, "../data", file);

// OPTION 1: using json2csv module
export async function convertRelayJSONToCSV(
  filename: string
): Promise<{ csvContent: string; recordCount: number; headers: string[] }> {
  // Read / parse JSON file
  const parsedFile = JSON.parse(fs.readFileSync(dataDir(filename), "utf8"));
  
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
    const files = fs.readdirSync(path.join(__dirname, "../data"));
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("No JSON files found");
      return results;
    }
    
    console.log(`Found ${jsonFiles.length} JSON files: ${jsonFiles.join(", ")}`);

    for (const file of jsonFiles) {
      try {
        const result = await convertRelayJSONToCSV(file);
        
        console.log(`Processing ${file}...`);

        const csvFilename = file.replace(".json", ".csv");
        fs.writeFileSync(dataDir(csvFilename), result.csvContent);

        results[file] = {
          csvFilename,
          recordCount: result.recordCount,
          headers: result.headers,
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

// standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  convertAllJSONFilesInDataFolder()
    .then((results) => {
      console.log(`\nProcessed ${Object.keys(results).length} files.`);
      console.log("Results:", results);
    })
    .catch((error) => {
      console.error("Conversion failed:", error);
      process.exit(1);
    });
}