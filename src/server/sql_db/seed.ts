import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db_connect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));  // get current directory where this script file is located
const dataDir = path.join(__dirname, '../data'); // path for /data folder

// SQL for creating tables (hard-coded in for now)
const CREATE_TABLES_SQL = `
-- Drop existing tables if they exist
DROP TABLE IF EXISTS faqs;
DROP TABLE IF EXISTS controls;

-- Create controls table
CREATE TABLE controls (
  id VARCHAR(255) PRIMARY KEY,
  category VARCHAR(100),
  short TEXT,
  long TEXT,
  created_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(255)
);

-- Create faqs table  
CREATE TABLE faqs (
  id VARCHAR(255) PRIMARY KEY,
  question TEXT,
  answer TEXT,
  created_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(255)
);
`;

// helper function to get table name from CSV filename
function getTableNameFromCSV(filename: string): string {
  return path.basename(filename, '.csv');
}

// Seed database from CSV files
async function seedFromCSVFiles() {
  console.log('Starting database seeding from CSV files...');
  
  // 1. Create tables
  await db.query(CREATE_TABLES_SQL);
  
  // 2. Find all CSV files
  const files = fs.readdirSync(dataDir);
  const csvFiles = files.filter(file => file.endsWith('.csv'));
  
  console.log(`Found ${csvFiles.length} CSV files: ${csvFiles.join(', ')}`);
  
  // 3. Process each CSV file
  for (const file of csvFiles) {
    console.log(`\nProcessing ${file}...`);
    
    const csvPath = path.join(dataDir, file);
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) {
      console.log(`No data in ${file}, skipping`);
      continue;
    }
    
    const headers = lines[0].split(',');
    const rows = lines.slice(1).filter(line => line.trim());
    const tableName = getTableNameFromCSV(file);
    
    console.log(`Inserting ${rows.length} records into ${tableName}...`);
    
    let insertedCount = 0;
    
    for (const row of rows) {
      const values = row.split(',').map(val => {
        const trimmed = val.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1).replace(/""/g, '"');
        }
        return trimmed;
      });
      
      try {
        const placeholders = headers.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${placeholders})`;
        await db.query(query, values);
        insertedCount++;
      } catch (error: any) {
        if (error.code === '23505') {
          console.log(`Skipped duplicate record`);
        } else {
          console.error(`Error inserting row: ${error.message}`);
          throw error;
        }
      }
    }
    
    console.log(`Inserted ${insertedCount} records into ${tableName}`);
  }
  
  console.log('\nDatabase seeding complete!');
}

// OFFLINE OPTION: Generate SQL file
// function generateSQLFile() {
//   console.log('Generating SQL seed file...');
  
//   let sqlContent = CREATE_TABLES_SQL + '\n\n';
  
//   const files = fs.readdirSync(dataDir);
//   const csvFiles = files.filter(file => file.endsWith('.csv'));
  
//   for (const file of csvFiles) {
//     console.log(`Processing ${file}...`);
    
//     const csvPath = path.join(dataDir, file);
//     const csvContent = fs.readFileSync(csvPath, 'utf8');
//     const lines = csvContent.split('\n');
    
//     if (lines.length < 2) continue;
    
//     const headers = lines[0].split(',');
//     const rows = lines.slice(1).filter(line => line.trim());
//     const tableName = getTableNameFromCSV(file);
    
//     sqlContent += `-- Data from ${file}\n`;
    
//     for (const row of rows) {
//       const values = row.split(',').map(val => {
//         const trimmed = val.trim();
//         if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
//           return trimmed.slice(1, -1).replace(/""/g, '"');
//         }
//         return trimmed;
//       });
      
//       // Escape single quotes for SQL
//       const escapedValues = values.map(v => `'${v.replace(/'/g, "''")}'`);
//       const insertSQL = `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${escapedValues.join(', ')});\n`;
//       sqlContent += insertSQL;
//     }
    
//     sqlContent += '\n';
//   }
  
//   const outputPath = path.join(__dirname, 'seed_data.sql');
//   fs.writeFileSync(outputPath, sqlContent);
  
//   console.log(`SQL file created: ${outputPath}`);
// }

// Main function
async function main() {
  const command = process.argv[2] || 'help';
  
  switch (command) {
    case 'supabase':
      // Seed Supabase database
      await seedFromCSVFiles();
      break;
      
    case 'sql':
      // Generate SQL file
      generateSQLFile();
      break;
      
    case 'help':
    default:
      console.log(`
Database Seeding Tool
Usage: npm run seed [command]

Commands:
  supabase  - Seed Supabase database from CSV files
  sql       - Generate SQL file for offline PostgreSQL database

Examples:
  npm run seed supabase  # Seed your Supabase database
  npm run seed sql       # Create SQL file for offline use
      `);
      break;
  }
}

// Run
main().catch(error => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});