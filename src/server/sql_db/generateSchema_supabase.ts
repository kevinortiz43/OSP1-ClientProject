import { pool } from "./db_connect_supabase";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // set current working folder

// ADD THIS FUNCTION OUTSIDE generateTypes
function mapPgTypeToTs(pgType: string, udtName?: string, columnName?: string): string {
  const typeMap: Record<string, string> = {
    integer: "number",
    numeric: "number",
    float4: "number",
    boolean: "boolean",
    text: "string",
    varchar: "string",
    timestamptz: "Date",
    date: "Date",
    json: "any",
    jsonb: "any",
  };

  // Check for array types first
  if (pgType === 'ARRAY' || (udtName && udtName.startsWith('_'))) {
    // Extract element type from udt_name
    // udt_name for text[] is '_text', for integer[] is '_int4', etc.
    if (udtName === '_text' || udtName === '_varchar') {
      return 'string[]';
    } else if (udtName === '_int4' || udtName === '_int8' || udtName === '_numeric') {
      return 'number[]';
    } else if (udtName === '_float8' || udtName === '_float4') {
      return 'number[]';
    } else if (udtName === '_bool') {
      return 'boolean[]';
    } else {
      // Generic array fallback
      return 'any[]';
    }
  }

  // Also check udt_name for non-array types
  if (udtName && typeMap[udtName]) {
    return typeMap[udtName];
  }

  return typeMap[pgType] || 'any';
}

async function generateTypes() {
  try {
    // get all tables from Supabase schema
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    let typesContent = '\n\nexport interface Supabase {\n';

    for (const { table_name } of tables) {
      // Query with udt_name to detect array types
      const { rows: columns } = await pool.query(`
        SELECT 
          column_name, 
          data_type, 
          udt_name,
          is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

      typesContent += `  ${table_name}: {\n`;

      for (const col of columns) {
        const tsType = mapPgTypeToTs(col.data_type, col.udt_name, col.column_name);
        const optional = col.is_nullable === 'YES' ? '?' : '';
        typesContent += `    ${col.column_name}${optional}: ${tsType};\n`;
      }

      typesContent += `  };\n`;
    }

    typesContent += '}\n';

    // write to separate file
    const outputPath = path.join(__dirname, 'schemas-supabase.ts');
    fs.writeFileSync(outputPath, typesContent);

    console.log(`Generated Supabase types for ${tables.length} tables at ${outputPath}`);
    await pool.end();

  } catch (error) {
    console.error('Failed to generate Supabase types:', error);
    process.exit(1);
  }
}

// run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTypes();
}

export { generateTypes };