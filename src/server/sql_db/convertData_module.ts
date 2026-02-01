import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Parser } from '@json2csv/plainjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CORRECTED PATH for windows
const dataDir = (file: string) => path.join(__dirname, "data", file);

// Ensure data directory exists
function ensureDataDirExists(): void {
  const dir = path.join(__dirname, "data");
  if (!fs.existsSync(dir)) {
    console.log(`Creating data directory at: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log(`Data directory exists at: ${dir}`);
  }
}

export async function convertRelayJSONToCSV(
  filename: string
): Promise<{ csvContent: string; recordCount: number; headers: string[] }> {
  console.log(`Reading file: ${dataDir(filename)}`);
  
  const fileContent = fs.readFileSync(dataDir(filename), "utf8");
  const parsedFile = JSON.parse(fileContent);
  
  console.log(`File parsed successfully. Keys:`, Object.keys(parsedFile));
  
  const topLevelKeys = Object.keys(parsedFile.data || {});
  if (topLevelKeys.length === 0) {
    throw new Error(`No data found in ${filename}`);
  }
  
  const dataKey = topLevelKeys[0];
  console.log(`Processing data key: ${dataKey}`);
  
  const edges = parsedFile.data[dataKey].edges;
  
  if (!edges || edges.length === 0) {
    throw new Error(`No edges found in ${filename}`);
  }
  
  console.log(`Found ${edges.length} edges`);
  
  const nodes = edges.map((edge: any) => edge.node);
  const fields = Object.keys(nodes[0]);
  
  console.log(`Fields detected:`, fields);
  
  const parser = new Parser({ fields });
  const csvContent = parser.parse(nodes);
  
  return {
    csvContent,
    recordCount: edges.length,
    headers: fields,
  };
}

export async function convertAllJSONFilesInDataFolder(): Promise<Record<string, any>> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Converting all JSON files using json2csv module...`);
  console.log(`${'='.repeat(60)}\n`);
  
  ensureDataDirExists();

  const results: Record<string, any> = {};
  const dataPath = path.join(__dirname, "data");

  try {
    console.log(`Scanning directory: ${dataPath}`);
    
    if (!fs.existsSync(dataPath)) {
      console.error(`ERROR: Data directory does not exist: ${dataPath}`);
      return results;
    }
    
    const files = fs.readdirSync(dataPath);
    console.log(`All files in directory:`, files);
    
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("  No JSON files found in data directory");
      return results;
    }
    
    console.log(`\nFound ${jsonFiles.length} JSON files: ${jsonFiles.join(", ")}\n`);

    for (const file of jsonFiles) {
      try {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`Processing: ${file}`);
        console.log(`${'─'.repeat(60)}`);
        
        const result = await convertRelayJSONToCSV(file);

        const csvFilename = file.replace(".json", ".csv");
        const csvPath = dataDir(csvFilename);
        
        console.log(`Writing CSV to: ${csvPath}`);
        fs.writeFileSync(csvPath, result.csvContent);
        
        if (fs.existsSync(csvPath)) {
          const stats = fs.statSync(csvPath);
          console.log(`File created successfully (${stats.size} bytes)`);
        } else {
          console.error(`✗ File was NOT created: ${csvPath}`);
        }

        results[file] = {
          csvFilename,
          csvPath,
          recordCount: result.recordCount,
          headers: result.headers,
        };

        console.log(`Created ${csvFilename} with ${result.recordCount} records`);
      } catch (error: any) {
        console.error(`✗ Failed to process ${file}:`);
        console.error(`  Error: ${error.message}`);
        console.error(`  Stack: ${error.stack}`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`SUMMARY: Processed ${Object.keys(results).length}/${jsonFiles.length} files`);
    console.log(`${'='.repeat(60)}\n`);

    return results;
  } catch (error: any) {
    console.error(`\n✗ ERROR reading data folder: ${error.message}`);
    console.error(`  Stack: ${error.stack}`);
    return results;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Script started at: ${new Date().toISOString()}`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Script location: ${__dirname}`);
  console.log(`Data directory: ${path.join(__dirname, "data")}\n`);
  
  convertAllJSONFilesInDataFolder()
    .then((results) => {
      console.log(`\nConversion completed successfully!`);
      console.log(`Total files processed: ${Object.keys(results).length}`);
      
      if (Object.keys(results).length > 0) {
        console.log(`\nResults:`);
        Object.entries(results).forEach(([jsonFile, data]: [string, any]) => {
          console.log(`  ${jsonFile} → ${data.csvFilename} (${data.recordCount} records)`);
        });
      }
      
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n✗ Conversion failed!");
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      process.exit(1);
    });
}