import { dockerPool } from "./db_connect_agnostic.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// OS-agnostic path setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// main function: generate TypeScript types from Docker PostgreSQL database schema
async function generateTypesFromDocker() {
  try {
    // get all table names from public schema
    // information_schema.tables = PostgreSQL system catalog with metadata about all tables
    const { rows: tables } = await dockerPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    // start building TypeScript interface content
    let typesContent = "\n\nexport interface DockerDatabase {\n";

    // iterate through each table to get its column definitions
    for (const { table_name } of tables) {
      // query for columns of current table
      // information_schema.columns = system catalog with column metadata
      // ordinal_position = column order in table definition
      const { rows: columns } = await dockerPool.query(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `,
        [table_name],
      );

      // add table interface to TypeScript content
      typesContent += `  ${table_name}: {\n`;

      // process each column in current table
      for (const col of columns) {
        // map PostgreSQL data type to TypeScript type
        const tsType = mapPgTypeToTs(col.data_type, col.column_name);

        // mark as optional if column allows NULL values
        const optional = col.is_nullable === "YES" ? "?" : "";

        // add column definition: name(optional): type;
        typesContent += `    ${col.column_name}${optional}: ${tsType};\n`;
      }

      typesContent += `  };\n`;
    }

    typesContent += "}\n";

    // write TypeScript types to file with OS-agnostic path
    // schemas-agnostic.ts will contain auto-generated TypeScript interfaces
    const outputPath = path.join(__dirname, "schemas-agnostic.ts");
    fs.writeFileSync(outputPath, typesContent, { encoding: "utf8" });

    console.log(
      `Generated Docker types for ${tables.length} tables at ${outputPath}`,
    );
    await dockerPool.end(); // close database connection pool
  } catch (error) {
    console.error("Failed to generate Docker types:", error);
    process.exit(1); // exit with error code on failure
  }
}

// helper: map PostgreSQL data types to TypeScript types

// also seems to be a bug with typing varchar -> 'string' (fix if time permits)

// Note: This is not an exhaustive list of all data types, i.e. BIGINT, REAL, etc. only most common types. Can add more types as needed

function mapPgTypeToTs(pgType: string, columnName?: string): string {
  // mapping dictionary: PostgreSQL type → TypeScript type
  const typeMap: Record<string, string> = {
    integer: "number",
    numeric: "number",
    boolean: "boolean",
    text: "string",
    varchar: "string",
    uuid: "string",
    "timestamp without time zone": "Date",
    "timestamp with time zone": "Date",
    timestamp: "Date",
    timestamptz: "Date",
    date: "Date",
    json: "any",
    jsonb: "any",
  };

  // special handling for categories columns (e.g., from CSV import)
  // categories columns contain JSONB arrays that should be typed as string[]
  if (pgType === "jsonb" && columnName?.toLowerCase().includes("categor")) {
    return "string[]"; // Your categories are string arrays
  }

  // return mapped type or 'any' for unknown types
  return typeMap[pgType] || "any";
}

// OS-agnostic standalone script detection
const isMainModule = () => {
  if (!process.argv || process.argv.length < 1) {
    return false;
  }

  // compare current file with the first argument using path resolution
  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1];

  // normalize paths for comparison across platforms
  // script ONLY runs if called directly (not imported as module)
  return path.resolve(currentFile) === path.resolve(mainFile);
};

// run if called directly as standalone script
if (isMainModule()) {
  generateTypesFromDocker();
}

export { generateTypesFromDocker };
