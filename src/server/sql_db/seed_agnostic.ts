import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { from } from "pg-copy-streams";
import { parse } from 'csv-parse/sync';
import { dockerPool } from "./db_connect_agnostic.js";

// cross-platform path handling 
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // directory of current script file
const dataDir = path.join(__dirname, "..", "data"); // data folder path

// extract table name from CSV filename
function getTableNameFromCSV(filename: string): string {
  // path.basename with ext removal for cross-platform compatibility
  // removes .csv extension and wraps in quotes for PostgreSQL safety
  const baseName = path.basename(filename, ".csv");
  return `"${baseName}"`; // quoted table name to handle special characters
}

// read CSV file and extract headers + 1st data row
function getCSVHeadersAndFirstRow(csvPath: string): {
  headers: string[];
  firstRow: string[];
} {
  // explicit encoding for cross-platform compatibility
  const content = fs.readFileSync(csvPath, { encoding: "utf8" });
  
  // parse CSV using csv-parse library
  // columns: true -> 1st row becomes headers, data becomes objects
  // skip_empty_lines: true -> ignore blank lines
  // trim: true -> remove whitespace from values
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  if (records.length === 0) {
    throw new Error("CSV file has no data");
  }
  
  // extract headers from 1st parsed object
  const headers = Object.keys(records[0]);
  const firstRow = Object.values(records[0]) as string[];
  
  console.log("parsed headers:", headers);
  console.log("parsed 1st row:", firstRow);
  
  return { headers, firstRow };
}

// infer PostgreSQL data type from value
// Note: This does not detect all SQL data types, i.e. BIGINT, REAL, etc. only common ones 
function inferTypeFromValue(value: string): string {
  if (!value) return "TEXT"; // empty/null values default to TEXT
  
  // check for ISO 8601 timestamp format: "2024-01-15T10:30:00"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    console.log('timestampz TYPE returned');
    return "TIMESTAMPTZ"; // timestamp with timezone
  }
  
  // detect JSON arrays: "[1,2,3]" or '["a","b"]'
  if (value.trim().startsWith('[') && value.trim().endsWith(']')) {
    console.log('JSONB TYPE returned for array');
    return "JSONB"; // PostgreSQL binary JSON type
  }

  // detect boolean values (case-insensitive)
  const trimmedValue = value.trim().toLowerCase();
  if (trimmedValue === 'true' || trimmedValue === 'false') {
    console.log('BOOLEAN detected:', trimmedValue);
    return "BOOLEAN";
  }

  // detect numeric values
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    // check if integer (no decimal point)
    if (Number.isInteger(num) && !value.includes('.')) {
      console.log(`INTEGER detected: ${value}`);
      return "INTEGER";
    } else {
      console.log(`NUMERIC detected: ${value}`);
      return "NUMERIC"; // decimal numbers
    }
  }
  
  // default to TEXT for strings and other types
  console.log(`TEXT detected: ${value}`);
  return "TEXT";
}

// generate PostgreSQL CREATE TABLE SQL statement
function generateCreateTableSQL(
  tableName: string,
  headers: string[],
  firstRow: string[],
): string {
  const columns = headers.map((header, i) => {
    let type = inferTypeFromValue(firstRow[i]);
    const quotedHeader = `"${header}"`; // quote column names for safety

// Why need quote column names:
// Example: const headers = ["First Name", "user.id", "2024-Revenue"]
// Without quotes in SQL: "First Name" → SQL sees: First (something) Name (something) 
// With quotes (safe): Result: [' "First Name" ', ' "user.id" ', ' "2024-Revenue" ']
// SQL: "First Name" (treated as single identifier)
    
    // special handling for ID columns - make them primary keys
    if (header.toLowerCase() === "id") {
      return `${quotedHeader} VARCHAR(255) PRIMARY KEY`;
    }

    // force categories columns to JSONB if they contain arrays
    if (header.toLowerCase().includes('categor') && type === "JSONB") {
      return `${quotedHeader} JSONB`;
    }

    return `${quotedHeader} ${type}`;
  });
  
  // build CREATE TABLE SQL with IF NOT EXISTS conditional
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(",\n  ")}\n);`;
}

//seed PostgreSQL database with CSV data
async function seedLocalWithCOPY() {
  console.log("Starting Local Docker PostgreSQL seeding...");
  
  // check if data folder exists
  if (!fs.existsSync(dataDir)) {
    console.log("Data folder does not exist");
    return;
  }
  
  // cross-platform CSV file detection
  const files = fs.readdirSync(dataDir);
  const csvFiles = files.filter((f) => 
    f.toLowerCase().endsWith(".csv") || 
    path.extname(f).toLowerCase() === ".csv"
  );

 // check if CSV files exist
  if (csvFiles.length === 0) {
    console.log("No CSV files found");
    return;
  }
  
  console.log(`Found ${csvFiles.length} CSV files\n`);
  
  // connect to local database
  const client = await dockerPool.connect();
  
  try {
    // process each CSV file
    for (const file of csvFiles) {
      console.log(`Processing ${file}...`);
      
      // use path.join for cross-platform compatibility
      const csvPath = path.join(dataDir, file);
      const tableName = getTableNameFromCSV(file);
      const { headers, firstRow } = getCSVHeadersAndFirstRow(csvPath);
      
      // generate and execute CREATE TABLE statement
      const createSQL = generateCreateTableSQL(tableName, headers, firstRow);
      await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
      await client.query(createSQL);
      
      console.log(`  Importing data...`);
      
      // prepare column names for COPY command
      // converts headers to strings joined by ,
      const quotedHeaders = headers.map((h) => `"${h}"`).join(", ");
      
// COPY "allTrustControls": Copy data into table named allTrustControls
// ("id","category","short",etc.):
// These columns in the database table will receive data
// Column 1 → "id"
// Column 2 → "category"
// Column 3 → "short"
// Etc.
// FROM STDIN: PostgreSQL says "Send me CSV data through a stream"
// CSV HEADER: "The 1st line of data contains column names, skip it when inserting"
      const copyStream = client.query(
        from(`COPY ${tableName}(${quotedHeaders}) FROM STDIN CSV HEADER`)
      );
      
      // create read stream from CSV file
      const fileStream = fs.createReadStream(csvPath);
      
      // pipe CSV file stream to PostgreSQL COPY stream
      await new Promise((resolve, reject) => {
        fileStream.pipe(copyStream).on("finish", resolve).on("error", reject);
      });
      
      // verify import count
      const result = await client.query(`SELECT COUNT(*) FROM ${tableName};`);
      console.log(`  Imported ${result.rows[0].count} rows\n`);
    }
    
    console.log("Local Docker seeding complete");
  } catch (error: any) {
    console.error("Local Docker seeding failed:", error.message);
    throw error;
  } finally {
    client.release(); // return connection to pool
  }
}

// OS-agnostic standalone script detection
const isMainModule = () => {
  if (!process.argv || process.argv.length < 1) {
    return false;
  }
  
  // compare current file with 1st arg using path resolution
  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1];
  
  // normalize paths for comparison across platforms (run script ONLY if path matches)
  return path.resolve(currentFile) === path.resolve(mainFile);
};

// standalone script execution
if (isMainModule()) {
  seedLocalWithCOPY().catch((error) => {
    console.error("Local Docker seeding failed:", error.message);
    process.exit(1);
  });
}

// export function for use as a module
export { seedLocalWithCOPY };