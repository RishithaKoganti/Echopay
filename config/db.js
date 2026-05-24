const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ WARNING: DATABASE_URL environment variable is not defined.');
}

const pool = new Pool({
  connectionString: connectionString,
  // Enable SSL connection for cloud-hosted databases (e.g. Supabase, Neon)
  // but disable it if running on localhost for local development
  ssl: connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))
    ? false
    : { rejectUnauthorized: false }
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL database connection failed:', err.message);
  } else {
    console.log('✅ PostgreSQL database connected successfully!');
    release();
  }
});

module.exports = pool;
