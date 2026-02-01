import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'test_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
});

async function loadCSVToDatabase() {
  const client = await pool.connect();
  
  try {
    const dataPath = path.join(__dirname, 'data');
    const csvFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.csv'));
    
    console.log(`\nFound ${csvFiles.length} CSV files to load\n`);
    
    for (const file of csvFiles) {
      // Use exact table name with proper casing
      const tableName = file.replace('.csv', '');
      const csvPath = path.join(dataPath, file);
      
      console.log(`${'─'.repeat(60)}`);
      console.log(`Loading ${file} into table "${tableName}"...`);
      console.log(`${'─'.repeat(60)}`);
      
      // Read and parse CSV file
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      console.log(`Read ${records.length} records from CSV`);
      
      if (records.length === 0) {
        console.log(` No records found in ${file}, skipping...`);
        continue;
      }
      
      // Get column names from first record
      const columns = Object.keys(records[0]);
      console.log(`Columns: ${columns.join(', ')}`);
      
      // Clear existing data
      await client.query(`DELETE FROM "${tableName}"`);
      console.log(`Cleared existing data from "${tableName}"`);
      
      // Insert records one by one (or in batches)
      let insertedCount = 0;
      
      for (const record of records) {
        const values = columns.map(col => {
          const value = record[col];
          
          // Handle empty strings and nulls
          if (value === '' || value === null || value === undefined) {
            return null;
          }
          
          // Try to parse dates
          if (col === 'createdAt' || col === 'updatedAt') {
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
          }
          
          return value;
        });
        
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const columnNames = columns.map(c => `"${c}"`).join(', ');
        
        const insertQuery = `
          INSERT INTO "${tableName}" (${columnNames})
          VALUES (${placeholders})
        `;
        
        await client.query(insertQuery, values);
        insertedCount++;
      }
      
      console.log(`Inserted ${insertedCount} records into "${tableName}"`);
      
      // Verify insertion
      const countResult = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
      console.log(`Verified: ${countResult.rows[0].count} records in table\n`);
    }
    
    console.log('═'.repeat(60));
    console.log('All CSV files loaded successfully!');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('\n✗ Failed to load CSV files:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  loadCSVToDatabase()
    .then(() => {
      console.log('\nCSV loading completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('CSV loading failed:', error);
      process.exit(1);
    });
}

export { loadCSVToDatabase };