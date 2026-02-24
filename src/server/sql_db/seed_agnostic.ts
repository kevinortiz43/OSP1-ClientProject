import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { from } from "pg-copy-streams";
import { parse } from "csv-parse/sync";
// import { dockerPool } from "./db_connect_local.js"; // LOCAL DOCKER DB ONLY
import { dockerPool } from "./db_connect_agnostic.js";

// Use cross-platform path handling
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

function getTableNameFromCSV(filename: string): string {
  // Use path.basename with extension removal for cross-platform compatibility
  const baseName = path.basename(filename, ".csv");
  return `"${baseName}"`;
}

function getCSVHeadersAndFirstRow(csvPath: string): {
  headers: string[];
  firstRow: string[];
} {
  // Explicit encoding for cross-platform compatibility
  const content = fs.readFileSync(csvPath, { encoding: "utf8" });
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error("CSV file has no data");
  }

  const headers = Object.keys(records[0]);
  const firstRow = Object.values(records[0]) as string[];

  return { headers, firstRow };
}

function inferTypeFromValue(value: string): string {
  if (!value) return "TEXT";

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return "TIMESTAMPTZ";
  }

  // detect JSON arrays
  if (value.trim().startsWith("[") && value.trim().endsWith("]")) {
    return "JSONB";
  }

  // detect boolean
  const trimmedValue = value.trim().toLowerCase();
  if (trimmedValue === "true" || trimmedValue === "false") {
    return "BOOLEAN";
  }

  // detect number - NOTE: added numeric and integer properties to test if this code works
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") {
    // check if integer
    if (Number.isInteger(num) && !value.includes(".")) {
      return "INTEGER";
    } else {
      return "NUMERIC";
    }
  }

  return "TEXT";
}

function generateCreateTableSQL(
  tableName: string,
  headers: string[],
  firstRow: string[],
): string {
  const columns = headers.map((header, i) => {
    const type = inferTypeFromValue(firstRow[i]);
    const quotedHeader = `"${header}"`;

    if (header.toLowerCase() === "id") {
      return `${quotedHeader} VARCHAR(255) PRIMARY KEY`;
    }

    // force categories columns to JSONB if they contain arrays
    if (header.toLowerCase().includes("categor") && type === "JSONB") {
      return `${quotedHeader} JSONB`;
    }

    return `${quotedHeader} ${type}`;
  });

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(",\n  ")}\n);`;
}

async function seedLocalWithCOPY() {
  if (!fs.existsSync(dataDir)) {
    return;
  }

  // Cross-platform CSV file detection
  const files = fs.readdirSync(dataDir);
  const csvFiles = files.filter(
    (f) =>
      f.toLowerCase().endsWith(".csv") ||
      path.extname(f).toLowerCase() === ".csv",
  );

  if (csvFiles.length === 0) {
    return;
  }

  // Use dockerPool instead of pool
  const client = await dockerPool.connect();

  try {
    for (const file of csvFiles) {
      // Use path.join for cross-platform compatibility
      const csvPath = path.join(dataDir, file);
      const tableName = getTableNameFromCSV(file);
      const { headers, firstRow } = getCSVHeadersAndFirstRow(csvPath);

      const createSQL = generateCreateTableSQL(tableName, headers, firstRow);
      await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
      await client.query(createSQL);

      const quotedHeaders = headers.map((h) => `"${h}"`).join(", ");
      const copyStream = client.query(
        from(`COPY ${tableName}(${quotedHeaders}) FROM STDIN CSV HEADER`),
      );

      const fileStream = fs.createReadStream(csvPath);

      await new Promise((resolve, reject) => {
        fileStream.pipe(copyStream).on("finish", resolve).on("error", reject);
      });

      const result = await client.query(`SELECT COUNT(*) FROM ${tableName};`);
      console.log(`  Imported ${result.rows[0].count} rows\n`);
    }
  } catch (error: any) {
    console.error("Local Docker seeding failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

// OS-agnostic standalone script detection
const isMainModule = () => {
  if (!process.argv || process.argv.length < 1) {
    return false;
  }

  // Compare current file with the first argument using path resolution
  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1];

  // Normalize paths for comparison across platforms
  return path.resolve(currentFile) === path.resolve(mainFile);
};

// Update CLI handler for cross-platform compatibility
if (isMainModule()) {
  // No command argument needed - this is only for local Docker
  seedLocalWithCOPY().catch((error) => {
    console.error("Local Docker seeding failed:", error.message);
    process.exit(1);
  });
}

// Export the local function
export { seedLocalWithCOPY };
