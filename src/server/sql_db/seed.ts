import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {from}   from "pg-copy-streams"; // necessary for seeding Supabase
import { parse } from 'csv-parse/sync'; 
import { pool } from "./db_connect"; // for supabased (temporary online solution)

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // current working directory
const dataDir = path.join(__dirname, "../data"); // data folder path

// input: CSV filename
// output: get table names from csv files
function getTableNameFromCSV(filename: string): string {
  const baseName = path.basename(filename, ".csv"); // remove '.csv'
  return `"${baseName}"`; // preserve case (add " " otherwise will be all lowercase)
} // NOTE: SQL query needs " " around table name, i.e. SELECT * FROM "allTrustControls";
// rather than SELECT * FROM alltrustcontrols (if we decide to use lowercase, then no " " around table name needed)

//input: csvPath
//output: headers and 1st row. Also check if csv file has data
function getCSVHeadersAndFirstRow(csvPath: string): {
  headers: string[];
  firstRow: string[];
} {
  const content = fs.readFileSync(csvPath, "utf8");
  
  // parse CSV with csv-parse module
  const records = parse(content, {
    columns: true,  // use 1st row -> headers
    skip_empty_lines: true,
    trim: true
  });
  
  if (records.length === 0) {
    throw new Error("CSV file has no data");
  }
  
  // get headers from 1st record
  const headers = Object.keys(records[0]);
  const firstRow = Object.values(records[0]) as string[];
  
  console.log("parsed headers:", headers);
  console.log("parsed 1st row:", firstRow);
  
  return { headers, firstRow };
}

// input: each value from 1st row
// output: string -> infer each type from each value
function inferTypeFromValue(value: string): string {
  if (!value) return "TEXT";

// test if regex matches dates:
// const testDate = "2025-12-31T16:47:02.587878+00:00";
// console.log('testDate type boolean:', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(testDate)); // should be true

//   console.log(`Testing regex on "${value}":`, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value));

//   check if ISO 8601 date/time format: YYYY-MM-DDThh:mm:ss
//   Examples: "2026-01-16T19:52:47.817794+00:00", "2024-01-15T10:30:00.123Z"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    console.log('timestampz TYPE returned')
    return "TIMESTAMPTZ"; // PostgreSQL timestamp with timezone
  }


  // check if number type (if not integer, then numeric)
  // NOTE: have NOT yet tested number data types to see if it recognizes correectly  
  const num = Number(value);
  if (!isNaN(num)) {
    return Number.isInteger(num) ? "INTEGER" : "NUMERIC";
  }

  // default to TEXT (handles any length of number to prevent rounding number)
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

// seeding supabase
async function seedSupabaseWithCOPY() {
  console.log("Starting Supabase seeding...");

  if (!fs.existsSync(dataDir)) {
    // checks to make sure data folder exists
    console.log("Data folder does not exist");
    return;
  }

  // check to verify CSV files exist in data folder
  const csvFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith(".csv")); // array of csv files
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
      const { headers, firstRow } = getCSVHeadersAndFirstRow(csvPath); // get headers and 1st row from each CSV file

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
        from(
          `COPY ${tableName}(${quotedHeaders}) FROM STDIN CSV HEADER`,
        ),
      );

      // 1. fileStream reads CSV file in chunks
      // 2. Each chunk flows through pipe() to copyStream
      // 3. copyStream sends chunks to PostgreSQL via connection
      // 4. PostgreSQL receives chunks as if typing them in STDIN (standard input)

      // create readable stream from CSV file on local machine
      const fileStream = fs.createReadStream(csvPath); // read each CSV file in chunks (in case large file)

      // pipe file stream into COPY command stream
      // connects local CSV file to Supbase connection
      await new Promise((resolve, reject) => {
        fileStream.pipe(copyStream).on("finish", resolve).on("error", reject);
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

