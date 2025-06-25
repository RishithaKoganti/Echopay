const mysql = require('mysql2');
const pool = mysql.createPool({
  user: 'root',       // e.g., rishitha
  password: 'rishitha@2512',
  database: 'echopay',       // e.g., echopaydb
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
// Test the connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connection established successfully');
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

testConnection();

module.exports = pool;
