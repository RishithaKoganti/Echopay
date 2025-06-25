USE echopay;

-- Users Table
CREATE TABLE users (
  user_id VARCHAR(36) PRIMARY KEY,           -- UUID v4
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  balance DECIMAL(10,2) DEFAULT 0.00
);

-- Transactions Table
CREATE TABLE transactions (
  transaction_id VARCHAR(36) PRIMARY KEY,
  sender_id VARCHAR(36),
  receiver_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  purpose VARCHAR(100),
  month VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(user_id),
  FOREIGN KEY (receiver_id) REFERENCES users(user_id)
);

-- Sample users
INSERT INTO users (user_id, username, email, password, balance)
VALUES
(UUID(), 'alice', 'alice@example.com', 'Alice@1234', 1000.00),
(UUID(), 'bob', 'bob@example.com', 'Bob@1234', 2000.00),
(UUID(), 'charlie', 'charlie@example.com', 'Charlie@1234', 1500.00);

-- Sample transaction (between any two users above)
-- You’ll need to get valid UUIDs from `users` table to insert here.
-- Example placeholder:
-- INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, purpose, month)
-- VALUES ('uuid4', 'sender_uuid', 'receiver_uuid', 500.00, 'Groceries', 'June');
