const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',     // or your remote DB host
  user: 'root',
  password: 'rishitha@2512',
  database: 'echopay',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Optional: test connection safely
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL DB connected!');
    connection.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
}

testConnection();

module.exports = pool;
