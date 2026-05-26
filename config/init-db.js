const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is not defined in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    const sqlPath = path.join(__dirname, 'db.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔄 Executing schema SQL from db.sql...');
    await pool.query(sql);

    console.log('✅ Database initialized successfully with all tables and seed data!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  } finally {
    await pool.end();
  }
}

init();
