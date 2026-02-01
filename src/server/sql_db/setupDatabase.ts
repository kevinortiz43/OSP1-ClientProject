import { convertAllJSONFilesInDataFolder } from './convertData_module.js';
import { createTables } from "./CreateSchema.ts"
import { loadCSVToDatabase } from "./loadCSV.ts"
async function setupDatabase() {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  COMPLETE DATABASE SETUP');
  console.log('═'.repeat(70));
  console.log('\n');

  try {
    // Step 1: Convert JSON to CSV
    console.log('STEP 1: Converting JSON files to CSV...\n');
    const conversionResults = await convertAllJSONFilesInDataFolder();
    console.log(`Converted ${Object.keys(conversionResults).length} files\n`);

    // Step 2: Create database schema
    console.log('STEP 2: Creating database tables...\n');
    await createTables();
    console.log('Database schema created\n');

    // Step 3: Load CSV data into database
    console.log('STEP 3: Loading CSV data into PostgreSQL...\n');
    await loadCSVToDatabase();
    console.log('Data loaded successfully\n');

    console.log('═'.repeat(70));
    console.log('  COMPLETE DATABASE SETUP FINISHED SUCCESSFULLY!');
    console.log('═'.repeat(70));
    console.log('\n');

  } catch (error) {
    console.error('\n✗ Database setup failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

export { setupDatabase };