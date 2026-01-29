import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // current working directory (where this file located)located
const dataDir = (file: string) => path.join(__dirname, "../data", file); // path for /data folder, also getting name of JSON input file

// CSV escaping function: Escaping existing quotes by doubling them is a technique used to include quotation marks within a string without terminating the string prematurely, commonly used in CSV files, SQL
// if str has value, wrap in quotes and escape existing quotes by doubling them like this: ""

const escape = (str: any) =>
  str ? `"${String(str).replace(/"/g, '""')}"` : "";


// generic conversion function to extract data inside node
// ASSUMES structure: { data: { collectionName: { edges: [{ node: {...} }] } } }
// Example: { data: { allTrustFaqs: { edges: [{ node: {...} }] } } }

export function convertRelayJSONToCSV(filename: string): {
  csvContent: string;
  recordCount: number;
  headers: string[];
} {
  // read and parse JSON file
  const parsedFile = JSON.parse(fs.readFileSync(dataDir(filename), "utf8"));

  // dynamically find edges array in relay-like structure
  // Example: data.allTrustControls.edges or data.allTrustFaqs.edges
  const topLevelKeys = Object.keys(parsedFile.data || {}); // 'allTrustFaqs'
  if (topLevelKeys.length === 0) {
    // check that there exists properties/fields inside of 'data' field (like 'allTrustFaqs')
    throw new Error(`No data found in ${filename}`);
  }

  // get 1st top-level key (e.g., "allTrustControls" or "allTrustFaqs")
  const dataKey = topLevelKeys[0]; // take only 1st nested obj (value of "allTrustFaqs")
  const edges = parsedFile.data[dataKey].edges; // get 1st nested obj's edges array

  // check to make sure there ARE edges
  if (!edges || edges.length === 0) {
    throw new Error(`No edges found in ${filename}`);
  }

  // get 1st node inside of edges array to discover fields dynamically
  const firstNode = edges[0].node; // only 1st node (assumes all other nodes have SAME fields)
  const fields = Object.keys(firstNode);

  const csvRows = edges
    .map(
      (
        e: any, // create array of field values from current node
      ) =>
        fields
          .map((field) => e.node[field]) // get values for all fields
          .map(escape) // escape each value for CSV
          .join(","), // join values with commas: "value1","value2","value3"
    )
    .join("\n"); // join all rows with newlines: row1\n row2\n row3

  const csvContent = fields.join(",") + "\n" + csvRows; // header row + data rows

  return {
    csvContent,
    recordCount: edges.length,
    headers: fields,
  };
}

// convert ALL JSON files in data folder
export function convertAllJSONFilesInDataFolder(): Record<string, any> {
  console.log(
    `\nStarting batch conversion of ALL JSON files from data folder...`,
  );

//   if (!fs.existsSync(dataDir)) { // checks to make sure data folder exists
//       console.log('Data folder does not exist');
//       return;
//     }

  const results: Record<string, any> = {}; // init empty obj

  try {
    // read all files in data folder
    const files = fs.readdirSync(path.join(__dirname, "../data"));

    const jsonFiles = files.filter((file) => file.endsWith(".json")); // array of JSON files

    // check to verify JSON files exist in /data folder
    if (jsonFiles.length === 0) {
      console.log("no JSON files found");
      return results;
    }
    
    console.log(
      `Found ${jsonFiles.length} JSON files: ${jsonFiles.join(", ")}`,
    );

    // iterate over each JSON file
    for (const file of jsonFiles) {
      try {
        const result = convertRelayJSONToCSV(file); // convert EACH file

        console.log(`\nProcessing ${file}...`);

        // Create CSV filename (same name but .csv instead of .json)
        const csvFilename = file.replace(".json", ".csv");
        fs.writeFileSync(dataDir(csvFilename), result.csvContent);

        results[file] = {
          // add metadata for each converted file
          csvFilename,
          recordCount: result.recordCount,
          headers: result.headers,
        };

        console.log(
          `Created ${csvFilename} with ${result.recordCount} records`,
        );
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

// import.meta.url = "file:///osp1-clientproject/src/server/sql_db/convertData.ts"
// process.argv[1] = "/osp1-clientproject/src/server/sql_db/convertData.ts"
// file://${process.argv[1]} = "file:///project/src/server/sql_db/convertData.ts"
// Result: true → Code inside if runs

// make runnable as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  // run generic function (all JSON files inside of /data folder)
  const results = convertAllJSONFilesInDataFolder();
  console.log(results);
  console.log(`Processed ${Object.keys(results).length} files.`);
}