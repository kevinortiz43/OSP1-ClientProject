import fs from "fs"; // <-- ADD THIS IMPORT (missing in your code)
import path from "path";
import { fileURLToPath } from "url";
import { from } from "pg-copy-streams"; // necessary for seeding Supabase
import { parse } from "csv-parse/sync";
import { pool } from "./db_connect_supabase"; // for supabased (temporary online solution)
import { stringify } from 'csv-stringify/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // current working directory
const dataDir = path.join(__dirname, "../data"); // data folder path

// input: CSV filename
// output: get table names from csv files
function getTableNameFromCSV(filename: string): string {
  const baseName = path.basename(filename, ".csv"); // remove '.csv'
  return `"${baseName}"`; // preserve case (add " " otherwise will be all lowercase)
} // NOTE: SQL query needs " " around table name, i.e. SELECT * FROM "allTrustControls";
// rather than SELECT * FROM alltrustcontrols (if we decide to use lowercase, then no " " around table name needed)

// infer type from value type
function inferTypeFromValue(value: string): string {
  if (!value) return "TEXT";
  
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    console.log('timestampz TYPE returned')
    return "TIMESTAMPTZ";
  }

  // PostgreSQL arrays (after preprocessing)
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    console.log('TEXT[] returned for PostgreSQL array');
    return "TEXT[]";
  }

  // detect JSON arrays (original format, just in case)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      JSON.parse(trimmed);
      console.log('TEXT[] returned for JSON array');
      return "TEXT[]";
    } catch {
      console.log('TEXT detected (invalid JSON array)');
      return "TEXT";
    }
  }

  // detect boolean
  const trimmedValue = value.trim().toLowerCase();
  if (trimmedValue === 'true' || trimmedValue === 'false') {
    console.log('BOOLEAN detected:', trimmedValue);
    return "BOOLEAN";
  }

// detect number - NOTE: added numeric and integer properties to test if this code works
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    // check if integer
    if (Number.isInteger(num) && !value.includes('.')) {
      console.log(`INTEGER detected: ${value}`);
      return "INTEGER";
    } else {
      console.log(`NUMERIC detected: ${value}`);
      return "NUMERIC";
    }
  }
  
  console.log(`TEXT detected: ${value}`);
  return "TEXT";
}

// input: table name,headers, and 1st row as args
// output: SQL query to create the table
function generateCreateTableSQL(
  tableName: string,
  headers: string[],
  firstRow: string[],
): string {
  const columns = headers.map((header, i) => {
    let type = inferTypeFromValue(firstRow[i]);

    const quotedHeader = `"${header}"`; // preserve case (not all lowercase)

    if (header.toLowerCase() === "id") {
      // if "id" then return string -> header + VARCHAR(255) PRIMARY KEY
      return `${quotedHeader} VARCHAR(255) PRIMARY KEY`;
    }
    return `${quotedHeader} ${type}`; // otherwise, return string -> header + type
  });

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(",\n  ")}\n);`; // SQL CREATE TABLE (if not exists) query with each generated `header + type`
}

// input: CSV file path
// output: processed CSV content, headers, and first row (with arrays converted to PostgreSQL format)
function processCSVWithArrays(csvPath: string): { content: string, headers: string[], firstRow: string[] } {
  const content = fs.readFileSync(csvPath, "utf8");
  
  // Parse the CSV
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error("CSV file has no data");
  }

  const headers = Object.keys(records[0]);
  
  // Process each record to convert JSON arrays to PostgreSQL arrays
  const processedRecords = records.map((record: any) => {
    const processed: any = {};
    
    for (const [key, value] of Object.entries(record)) {
      const strValue = String(value).trim();
      
      // Check if it's a JSON array
      if (strValue.startsWith('[') && strValue.endsWith(']')) {
        try {
          // Fix escaped quotes before parsing
          const fixedJson = strValue.replace(/""/g, '"');
          const array = JSON.parse(fixedJson);
          // Convert to PostgreSQL array format: {"item1","item2","item3"}
          processed[key] = `{${array.map((item: string) => `"${item.replace(/"/g, '\\"')}"`).join(',')}}`;
        } catch {
          // If parsing fails, keep original
          processed[key] = value;
        }
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  });

  // Get first row for type inference (after processing)
  const firstRow = Object.values(processedRecords[0]) as string[];
  
  // Convert processed records back to CSV format (SYNCHRONOUS VERSION)
  const processedContent = stringify(processedRecords, {
    header: true,
    columns: headers,
  });
  
  return { content: processedContent, headers, firstRow };
}


// seeding supabase
async function seedSupabaseWithCOPY() {
  console.log("Starting Supabase seeding...");

  if (!fs.existsSync(dataDir)) {
    // checks to make sure data folder exists
    console.log("Data folder does not exist");
    return;
  }

  // check to verify CSV files exist in data folder
  // EXCLUDE temp files (files starting with 'temp_') to avoid processing temporary files
  const csvFiles = fs.readdirSync(dataDir).filter((f) => 
    f.endsWith(".csv") && !f.startsWith("temp_") // <-- ADD THIS
  );
  
  if (csvFiles.length === 0) {
    console.log("No CSV files found");
    return;
  }
  console.log(`Found ${csvFiles.length} CSV files\n`);

  // connect to Supabase
  const client = await pool.connect();

  // iterate over each CSV file
  try {
    for (const file of csvFiles) {
      console.log(`Processing ${file}...`);

      const csvPath = path.join(dataDir, file); // get each CSV file path by joining data path + each filename from array of csv files
      const tableName = getTableNameFromCSV(file); // get table name from each CSV filename

     // Use processing function to convert JSON arrays to PostgreSQL format
      const { content: processedContent, headers, firstRow } = processCSVWithArrays(csvPath); // get headers and 1st row from each CSV file
      
      // Create a temporary processed file
      const tempPath = path.join(dataDir, `temp_${file}`);
      fs.writeFileSync(tempPath, processedContent);

      const createSQL = generateCreateTableSQL(tableName, headers, firstRow); // dynamically create SQL query string
      await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`); // delete any preexisting table if already exists
      await client.query(createSQL); // create SQL table with headers (no data populated yet)

      console.log(`  Importing data...`);

      // using copyFrom() since Supabase blocks COPY FROM a local file (security reasons)
      // Build PostgreSQL COPY command:
      // COPY table_name(column1, column2, ...) FROM STDIN CSV HEADER
      // - FROM STDIN: Tells PostgreSQL to expect data via connection stream
      // - CSV: Specifies CSV format
      // - HEADER: First line contains column names
      const quotedHeaders = headers.map((h) => `"${h}"`).join(", ");
      const copyStream = client.query(
        from(`COPY ${tableName}(${quotedHeaders}) FROM STDIN CSV HEADER`),
      );

      // 1. fileStream reads CSV file in chunks
      // 2. Each chunk flows through pipe() to copyStream
      // 3. copyStream sends chunks to PostgreSQL via connection
      // 4. PostgreSQL receives chunks as if typing them in STDIN (standard input)

      // create readable stream from CSV file on local machine
      const fileStream = fs.createReadStream(tempPath); // read each CSV file in chunks (in case large file)

      // pipe file stream into COPY command stream
      // connects local CSV file to Supbase connection
      await new Promise((resolve, reject) => {
        fileStream.pipe(copyStream).on("finish", () => {
          // Clean up temp file after successful import
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          resolve(true);
        }).on("error", (error) => {
          // Clean up temp file even on error
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          reject(error);
        });
      });

      // verify import by counting rows
      // confirms data was actually inserted into the table
      const result = await client.query(`SELECT COUNT(*) FROM ${tableName};`);
      console.log(`  Imported ${result.rows[0].count} rows\n`);
    }

    console.log("Seeding complete");
  } catch (error: any) {
    console.error("Seeding failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

// make runnable as standalone scripts
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === "supabase") {
    // command for supabase
    seedSupabaseWithCOPY().catch((error) => {
      console.error("Seeding failed:", error.message);
      process.exit(1);
    });
  } else {
    console.log(`Unknown command: ${command}`);
    process.exit(1);
  }
}

export { seedSupabaseWithCOPY };