import { dockerPool } from "./db_connect_agnostic.js"; // use Docker local connection
import fs from 'fs';
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateTypesFromDocker() {
  try {
    // get all tables from Docker PostgreSQL
    const { rows: tables } = await dockerPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    let typesContent = '\n\nexport interface DockerDatabase {\n';

    for (const { table_name } of tables) {
      const { rows: columns } = await dockerPool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

      typesContent += `  ${table_name}: {\n`;

      for (const col of columns) {
        const tsType = mapPgTypeToTs(col.data_type, col.column_name);
        const optional = col.is_nullable === 'YES' ? '?' : '';
        typesContent += `    ${col.column_name}${optional}: ${tsType};\n`;
      }

      typesContent += `  };\n`;
    }

    typesContent += '}\n';

    // write to separate file - OS agnostic path
    const outputPath = path.join(__dirname, 'schemas-agnostic.ts');
    fs.writeFileSync(outputPath, typesContent, { encoding: 'utf8' });

    console.log(`Generated Docker types for ${tables.length} tables at ${outputPath}`);
    await dockerPool.end();

  } catch (error) {
    console.error('Failed to generate Docker types:', error);
    process.exit(1);
  }
}

function mapPgTypeToTs(pgType: string, columnName?: string): string {
  const typeMap: Record<string, string> = {
    'integer': 'number',
    'bigint': 'number',
    'numeric': 'number',
    'real': 'number',
    'double precision': 'number',
    'boolean': 'boolean',
    'text': 'string',
    'varchar': 'string',
    'uuid': 'string',
    'timestamp without time zone': 'Date',
    'timestamp with time zone': 'Date',
    'timestamp': 'Date',
    'timestamptz': 'Date',
    'date': 'Date',
    'json': 'any',
    'jsonb': 'any',
  };

  // handling for categories
  if (pgType === 'jsonb' && columnName?.toLowerCase().includes('categor')) {
    return 'string[]';  // Your categories are string arrays
  }

  return typeMap[pgType] || 'any';
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

// run if called directly
if (isMainModule()) {
  generateTypesFromDocker();
}

export { generateTypesFromDocker };