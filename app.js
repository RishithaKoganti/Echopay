const express = require('express');
const app = express();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const expressLayouts = require('express-ejs-layouts');
const pool = require('./config/db'); // PostgreSQL pool

require('dotenv').config();

const port = process.env.PORT || 5003;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// EJS Layouts configuration
app.use(expressLayouts);
app.set('layout', 'layout'); // Sets default layout file to views/layout.ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration using PostgreSQL Store
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'echopay-session-encryption-key-1234',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true in production (requires HTTPS)
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Middleware to expose session variables to EJS views
app.use((req, res, next) => {
  res.locals.username = req.session.username || null;
  next();
});

// Routes

// Root redirects to Home
app.get('/', (req, res) => res.redirect('/home'));

// Home
app.get('/home', (req, res) => {
  res.render('index.ejs', { title: 'Welcome to EchoPay' });
});

// Signup (GET)
app.get('/signup', (req, res) => {
  if (req.session.username) return res.redirect('/main');
  res.render('signup.ejs', { errors: null, formData: {}, title: 'Create Account' });
});

// Signup (POST)
app.post('/signup', [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 }).withMessage('Username must be between 3 and 20 characters.')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores.'),
  body('email')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('password')
    .matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/)
    .withMessage('Password must contain at least 1 uppercase letter, 1 number, and be at least 8 characters long.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  body('initialAmount').isFloat({ min: 0 }).withMessage('Initial amount must be a positive number.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('signup.ejs', { 
      errors: errors.array(), 
      formData: req.body,
      title: 'Create Account'
    });
  }

  const { username, email, password, initialAmount } = req.body;
  const userId = uuidv4();
  const saltRounds = 10;

  try {
    // Check if email or username already exists
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userCheck.rows.length > 0) {
      const exists = userCheck.rows[0].username === username ? 'Username' : 'Email';
      return res.status(400).render('signup.ejs', {
        errors: [{ msg: `${exists} is already registered.` }],
        formData: req.body,
        title: 'Create Account'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const sql = 'INSERT INTO users (user_id, username, email, password, balance) VALUES ($1, $2, $3, $4, $5)';
    await pool.query(sql, [userId, username, email, hashedPassword, initialAmount]);
    
    // Automatically log in user after successful signup
    req.session.username = username;
    res.redirect('/main');
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).render('signup.ejs', {
      errors: [{ msg: 'Signup failed. Server error.' }],
      formData: req.body,
      title: 'Create Account'
    });
  }
});

// Login (GET)
app.get('/login', (req, res) => {
  if (req.session.username) return res.redirect('/main');
  res.render('login.ejs', { error: null, title: 'Login' });
});

// Login (POST)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        req.session.username = user.username;
        res.redirect('/main');
      } else {
        res.status(401).render('login.ejs', { error: 'Invalid email or password.', title: 'Login' });
      }
    } else {
      res.status(401).render('login.ejs', { error: 'Invalid email or password.', title: 'Login' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login.ejs', { error: 'Server error. Please try again later.', title: 'Login' });
  }
});

// Main dashboard
app.get('/main', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [req.session.username]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).send('User not found');

    // Fetch transaction list (defaults to last 15 for dashboard performance)
    const [transactionsResult] = await Promise.all([
      pool.query(`
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
        WHERE (t.sender_id = $1 OR t.receiver_id = $2)
        ORDER BY t.created_at DESC
      `, [user.user_id, user.user_id])
    ]);

    const safeTransactions = transactionsResult.rows.map(t => ({
      transaction_id: t.transaction_id,
      amount: Number(t.amount),
      purpose: t.purpose || 'General',
      month: t.month,
      created_at: t.created_at.toISOString(),
      sender_name: t.sender_name,
      receiver_name: t.receiver_name
    }));

    res.render('main.ejs', {
      user,
      transactions: safeTransactions,
      queryPeriod: null,
      title: 'Dashboard'
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Server error loading dashboard.');
  }
});

// History
app.get('/history', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [req.session.username]);
    const user = userResult.rows[0];

    if (!user) return res.status(404).send('User not found');

    const result = await pool.query(`
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
      WHERE t.sender_id = $1 OR t.receiver_id = $2
      ORDER BY t.created_at DESC
    `, [user.user_id, user.user_id]);

    const safeTransactions = result.rows.map(t => ({
      transaction_id: t.transaction_id,
      amount: Number(t.amount),
      purpose: t.purpose || 'General',
      month: t.month,
      created_at: t.created_at.toISOString(),
      sender_name: t.sender_name,
      receiver_name: t.receiver_name
    }));

    res.render('history.ejs', { user, transactions: safeTransactions, title: 'History' });

  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).send('Server error loading transaction history.');
  }
});

// Send Money (GET)
app.get('/sendmoney', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  try {
    const currentUserResult = await pool.query('SELECT * FROM users WHERE username = $1', [req.session.username]);
    const currentUser = currentUserResult.rows[0];

    // Seed list (empty initially for autocomplete lookup, but we pass it as empty)
    res.render('sendmoney.ejs', { currentUser, users: [], error: null, success: null, title: 'Send Money' });
  } catch (err) {
    console.error('Error loading send money page:', err);
    res.status(500).send('Server error.');
  }
});

// Send Money (POST) - Housed in an ACID transaction
app.post('/sendmoney', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  const { amount: rawAmount, purpose, receiver_username } = req.body;
  const amount = parseFloat(rawAmount);

  // Validation
  if (isNaN(amount) || amount <= 0) {
    return res.render('sendmoney.ejs', {
      currentUser: { username: req.session.username },
      users: [],
      error: 'Transaction amount must be a positive number.',
      success: null,
      title: 'Send Money'
    });
  }

  if (receiver_username === req.session.username) {
    return res.render('sendmoney.ejs', {
      currentUser: { username: req.session.username },
      users: [],
      error: 'Self-transfers are not allowed.',
      success: null,
      title: 'Send Money'
    });
  }

  const transactionId = uuidv4();
  const currentDate = new Date();
  const month = currentDate.toLocaleString('default', { month: 'long' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock sender for update to prevent concurrent double spends
    const senderRes = await client.query(
      'SELECT user_id, balance FROM users WHERE username = $1 FOR UPDATE',
      [req.session.username]
    );
    if (senderRes.rows.length === 0) {
      throw new Error('Sender user record not found.');
    }
    const sender = senderRes.rows[0];

    // Check balance
    if (Number(sender.balance) < amount) {
      throw new Error('Insufficient account balance.');
    }

    // 2. Lock receiver for update
    const receiverRes = await client.query(
      'SELECT user_id FROM users WHERE username = $1 FOR UPDATE',
      [receiver_username]
    );
    if (receiverRes.rows.length === 0) {
      throw new Error(`Receiver user "${receiver_username}" does not exist.`);
    }
    const receiver = receiverRes.rows[0];

    // 3. Deduct from sender, credit receiver
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE user_id = $2',
      [amount, sender.user_id]
    );
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
      [amount, receiver.user_id]
    );

    // 4. Log the transaction
    const sql = `
      INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, purpose, month)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await client.query(sql, [transactionId, sender.user_id, receiver.user_id, amount, purpose || 'General', month]);

    await client.query('COMMIT');

    res.render('sendmoney.ejs', {
      currentUser: { username: req.session.username },
      users: [],
      error: null,
      success: `Successfully transferred ₹${amount.toFixed(2)} to ${receiver_username}!`,
      title: 'Send Money'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction rolled back due to error:', err.message);

    res.render('sendmoney.ejs', {
      currentUser: { username: req.session.username },
      users: [],
      error: err.message || 'Transaction processing failed.',
      success: null,
      title: 'Send Money'
    });
  } finally {
    client.release();
  }
});

// JSON API Endpoint: Get user transactions with date filter (AJAX refresh)
app.get('/api/transactions', async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [req.session.username]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

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
      WHERE (t.sender_id = $1 OR t.receiver_id = $2)
    `;
    const queryParams = [user.user_id, user.user_id];

    const { start, end } = req.query;
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate) {
        query += ` AND t.created_at::date BETWEEN $3 AND $4`;
        queryParams.push(start, end);
      }
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(query, queryParams);
    const transactions = result.rows.map(t => ({
      transaction_id: t.transaction_id,
      amount: Number(t.amount),
      purpose: t.purpose || 'General',
      month: t.month,
      created_at: t.created_at.toISOString(),
      sender_name: t.sender_name,
      receiver_name: t.receiver_name
    }));

    res.json({ transactions });
  } catch (err) {
    console.error('API transactions fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch transaction data.' });
  }
});

// JSON API Endpoint: Search for username autocomplete suggestions
app.get('/api/users/search', async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });

  const { q } = req.query;
  if (!q || q.trim() === '') {
    return res.json({ users: [] });
  }

  try {
    const result = await pool.query(
      'SELECT username FROM users WHERE username ILIKE $1 AND username != $2 LIMIT 6',
      [`%${q}%`, req.session.username]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('API search users error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/home');
  });
});

// Expose express app for Vercel
module.exports = app;

// Start local server if file executed directly (not imported as a module by Vercel)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}
