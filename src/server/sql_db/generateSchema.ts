import { pool } from './db_connect';
import fs from 'fs';
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // set current working folder

async function generateTypes() {
  try {
    // get all tables from Supabase schema
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    let typesContent = '\n\nexport interface Database {\n';

    for (const { table_name } of tables) { // get column info for each table
      const { rows: columns } = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

      typesContent += `  ${table_name}: {\n`;
      
      for (const col of columns) {
        const tsType = mapPgTypeToTs(col.data_type);
        const optional = col.is_nullable === 'YES' ? '?' : '';
        typesContent += `    ${col.column_name}${optional}: ${tsType};\n`;
      }
      
      typesContent += `  };\n`;
    }

    typesContent += '}\n';

    // write to schemas file
    const outputPath = path.join(__dirname, 'schemas.ts');
    fs.writeFileSync(outputPath, typesContent);
    
    console.log(`Generated types for ${tables.length} tables at ${outputPath}`);
    await pool.end();
    
  } catch (error) {
    console.error('Failed to generate types:', error);
    process.exit(1);
  }
}

// various types 
// needed to add these to get it to recognize date types:
//  'timestamp without time zone': 'Date',  
// 'timestamp with time zone': 'Date',
// NOTE: have NOT yet tested number data types     
function mapPgTypeToTs(pgType: string): string {
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
  return typeMap[pgType] || 'any';
}

// run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTypes();
}

export { generateTypes };