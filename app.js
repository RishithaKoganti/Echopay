const express = require('express');
const app = express();
const port = 5003;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('./config/db'); // ✅ Using db.js for MySQL pool
const session = require('express-session');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'your-secret-key', // Change this to a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set `secure: true` if using HTTPS
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to make `username` available in all views
app.use((req, res, next) => {
  res.locals.username = req.session.username || null; // If the user is logged in, pass the username to the views
  next();
});

// Routes

// Root
app.get('/', (req, res) => res.send('Working'));

// Home
app.get('/home', (req, res) => res.render('index.ejs'));

// Signup (GET)
app.get('/signup', (req, res) => res.render('signup.ejs'));

// Signup (POST)
app.post('/signup', [
  body('username').notEmpty(),
  body('email').isEmail(),
  body('password')
    .matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/)
    .withMessage('Password must have 1 uppercase letter, 1 number, and be at least 8 characters long.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('initialAmount').isFloat({ min: 0 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password, initialAmount } = req.body;
  const userId = uuidv4();

  try {
    const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).send('Email already exists.');
    }

    const sql = 'INSERT INTO users (user_id, username, email, password, balance) VALUES (?, ?, ?, ?, ?)';
    await pool.query(sql, [userId, username, email, password, initialAmount]);
    res.redirect('/login');
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).send('Signup failed.');
  }
});

// Login (GET)
app.get('/login', (req, res) => res.render('login.ejs'));

// Login (POST)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND password = ?',
      [email, password]
    );

    if (rows.length > 0) {
      // Login success: Store username in session
      req.session.username = rows[0].username;
      res.redirect('/main');
    } else {
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Server error');
  }
});

// Main dashboard
// Main dashboard
app.get('/main', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  try {
    const [userResult] = await pool.query('SELECT * FROM users WHERE username = ?', [req.session.username]);
    const user = userResult[0];
    if (!user) return res.status(404).send('User not found');

    let query = `
      SELECT 
        t.transaction_id,
        t.amount,
        t.purpose,
        t.month,
        t.created_at,
        sender.username AS sender_name,
        receiver.username AS receiver_name
      FROM transactions t
      LEFT JOIN users sender ON t.sender_id = sender.user_id
      LEFT JOIN users receiver ON t.receiver_id = receiver.user_id
      WHERE (t.sender_id = ? OR t.receiver_id = ?)
    `;

    const queryParams = [user.user_id, user.user_id];
    const queryPeriod = {};

    // Apply date filter if both start and end are provided
    const { start, end } = req.query;
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);

      // Validate dates
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate) {
        query += ` AND DATE(t.created_at) BETWEEN ? AND ?`;
        queryParams.push(start, end);
        queryPeriod.start = start;
        queryPeriod.end = end;
      }
    }

    query += ` ORDER BY t.created_at DESC`;

    const [transactions] = await pool.query(query, queryParams);

    const safeTransactions = transactions.map(t => ({
      transaction_id: t.transaction_id,
      amount: Number(t.amount),
      purpose: t.purpose,
      month: t.month,
      created_at: t.created_at.toISOString(),
      sender_name: t.sender_name,
      receiver_name: t.receiver_name
    }));

    res.render('main.ejs', {
      user,
      transactions: safeTransactions,
      queryPeriod: queryPeriod.start ? queryPeriod : null
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Server error');
  }
});


// History
app.get('/history', async (req, res) => {
  if (!req.session.username) return res.redirect('/login'); // Ensure the user is logged in

  try {
    // Fetch the logged-in user's details
    const [userResult] = await pool.query('SELECT * FROM users WHERE username = ?', [req.session.username]);
    const user = userResult[0];

    if (!user) return res.status(404).send('User not found');

    // Fetch transactions for the user
    const [transactions] = await pool.query(`
      SELECT 
        t.transaction_id,
        t.amount,
        t.purpose,
        t.month,
        t.created_at,
        sender.username AS sender_name,
        receiver.username AS receiver_name
      FROM transactions t
      LEFT JOIN users sender ON t.sender_id = sender.user_id
      LEFT JOIN users receiver ON t.receiver_id = receiver.user_id
      WHERE t.sender_id = ? OR t.receiver_id = ?
      ORDER BY t.created_at DESC
    `, [user.user_id, user.user_id]);

    // Serialize transactions
    const safeTransactions = transactions.map(t => ({
      transaction_id: t.transaction_id,
      amount: t.amount,
      purpose: t.purpose,
      month: t.month,
      created_at: t.created_at.toISOString(),
      sender_name: t.sender_name,
      receiver_name: t.receiver_name
    }));

    res.render('history.ejs', { user, transactions: safeTransactions });

  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).send('Server error');
  }
});


// Send Money
// GET Send Money page with user list
app.get('/sendmoney', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  try {
    const [currentUserResult] = await pool.query('SELECT * FROM users WHERE username = ?', [req.session.username]);
    const currentUser = currentUserResult[0];

    // Get all other users except the current user
    const [users] = await pool.query('SELECT username FROM users WHERE username != ?', [req.session.username]);

    res.render('sendmoney.ejs', { currentUser, users });
  } catch (err) {
    console.error('Error loading send money page:', err);
    res.status(500).send('Server error');
  }
});

// POST Send Money form submission
app.post('/sendmoney', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  const { amount, purpose, receiver_username } = req.body;
  const transactionId = uuidv4();
  const currentDate = new Date();
  const month = currentDate.toLocaleString('default', { month: 'long' });

  try {
    // Get sender's user_id
    const [senderRes] = await pool.query('SELECT user_id FROM users WHERE username = ?', [req.session.username]);
    const senderId = senderRes[0].user_id;

    // Get receiver's user_id
    const [receiverRes] = await pool.query('SELECT user_id FROM users WHERE username = ?', [receiver_username]);
    const receiverId = receiverRes[0].user_id;

    const sql = `
      INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, purpose, month)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await pool.query(sql, [transactionId, senderId, receiverId, amount, purpose, month]);

    res.redirect('/main');
  } catch (err) {
    console.error('Error processing transaction:', err);
    res.status(500).send('Transaction failed');
  }
});


// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/home'); // Redirect to home after logout
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
