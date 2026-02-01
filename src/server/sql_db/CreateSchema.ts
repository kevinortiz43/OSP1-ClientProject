import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'test_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
});

async function createTables() {
  const client = await pool.connect();
  
  try {
    console.log('Creating database tables...\n');

    // Drop existing tables if they exist (for clean slate)
    console.log('Dropping existing tables if they exist...');
    await client.query(`
      DROP TABLE IF EXISTS "allTrustControls" CASCADE;
      DROP TABLE IF EXISTS "allTrustFaqs" CASCADE;
    `);
    console.log('Existing tables dropped\n');

    // Create allTrustControls table
    console.log('Creating allTrustControls table...');
    await client.query(`
      CREATE TABLE "allTrustControls" (
        id VARCHAR(255) PRIMARY KEY,
        category VARCHAR(255),
        short TEXT,
        long TEXT,
        "createdAt" TIMESTAMP,
        "createdBy" VARCHAR(255),
        "updatedAt" TIMESTAMP,
        "updatedBy" VARCHAR(255)
      );
    `);
    console.log('allTrustControls table created');

    // Create allTrustFaqs table
    console.log('Creating allTrustFaqs table...');
    await client.query(`
      CREATE TABLE "allTrustFaqs" (
        id VARCHAR(255) PRIMARY KEY,
        question TEXT,
        answer TEXT,
        "createdAt" TIMESTAMP,
        "createdBy" VARCHAR(255),
        "updatedAt" TIMESTAMP,
        "updatedBy" VARCHAR(255)
      );
    `);
    console.log('allTrustFaqs table created\n');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `);

    console.log('Tables in database:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\nAll tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTables()
    .then(() => {
      console.log('\nDatabase schema creation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Schema creation failed:', error);
      process.exit(1);
    });
}

export { createTables };