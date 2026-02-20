import { dockerPool } from "./db_connect_agnostic.js";
import fs from 'fs';
import path from "path";
import { fileURLToPath } from "url";

// Note: This script auto-generates TypeScript interfaces based on PostgreSQL data types. It will auto-create a schemas-agnostic.ts file in sql_db folder.
// Currently, this script is unused, but it could be useful if further functionality were added to this project.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// generate TypeScript types from Docker PostgreSQL database schema
async function generateTypesFromDocker() {
  try {
    const { rows: tables } = await dockerPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // start building TypeScript interface content
    let typesContent = '\n\nexport interface DockerDatabase {\n';

    for (const { table_name } of tables) {
      const { rows: columns } = await dockerPool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

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

    const outputPath = path.join(__dirname, 'schemas-agnostic.ts'); // customize the filename of the generated Typescript schema 
    fs.writeFileSync(outputPath, typesContent, { encoding: 'utf8' });

    console.log(`Generated Docker types for ${tables.length} tables at ${outputPath}`);
    await dockerPool.end();

  } catch (error) { 
    console.error('Failed to generate Docker types:', error);
    process.exit(1);
  }
}

// helper: map PostgreSQL data types to TypeScript types
// Note: This is not an exhaustive list of all data types, i.e. BIGINT, REAL, etc. only most common types. Can add more types as needed

function mapPgTypeToTs(pgType: string, columnName?: string): string {
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

  // handling for ID columns
  if (columnName === 'id' || columnName?.endsWith('_id')) {
    return 'string';  // fixing id type to string, not 'any'
  }

  // categories columns contain JSONB arrays that should be typed as string[]
  if (pgType === 'jsonb' && columnName?.toLowerCase().includes('categor')) {
    return 'string[]';  // Your categories are string arrays
  }

  // return mapped type or 'any' for unknown types
  return typeMap[pgType] || 'any';
}

// OS-agnostic standalone script detection
const isMainModule = () => {
  if (!process.argv || process.argv.length < 1) {
    return false;
  }

  // Compare current file with the 1st argument using path resolution
  const currentFile = fileURLToPath(import.meta.url);
  const mainFile = process.argv[1];

  // normalize paths for comparison across platforms
  return path.resolve(currentFile) === path.resolve(mainFile);
};

// run if called directly as standalone script
if (isMainModule()) {
  generateTypesFromDocker();
}

export { generateTypesFromDocker };