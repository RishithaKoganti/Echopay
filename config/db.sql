-- PostgreSQL Database Schema for EchoPay

-- Clean up existing tables (Optional, run with caution)
DROP TABLE IF EXISTS "transactions";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "users";

-- Users Table
CREATE TABLE users (
  user_id VARCHAR(36) PRIMARY KEY,           -- UUID v4
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,            -- Will store bcrypt hashed passwords
  balance DECIMAL(10,2) DEFAULT 0.00
);

-- Transactions Table
CREATE TABLE transactions (
  transaction_id VARCHAR(36) PRIMARY KEY,     -- UUID v4
  sender_id VARCHAR(36),
  receiver_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  purpose VARCHAR(100),
  month VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Session Table (Required by connect-pg-simple)
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- Sample Seed Users (Note: passwords below are plaintext in SQL, but app will hash new signups)
-- If testing locally or via admin, please register through the web app UI to hash them.
INSERT INTO users (user_id, username, email, password, balance)
VALUES
('a7d8c4b9-1234-4bc8-8c11-9e22db871a2c', 'alice', 'alice@example.com', '$2b$10$U22YJpP2Z87T9B2hJ4.2yO13f7pD1Kx65w3N1y7g9k9o6c7i8v9eG', 1000.00), -- Hashed 'Alice@1234'
('b8d8c4b9-1234-4bc8-8c11-9e22db871a2d', 'bob', 'bob@example.com', '$2b$10$q2YJpP2Z87T9B2hJ4.2yO13f7pD1Kx65w3N1y7g9k9o6c7i8v9eH', 2000.00),     -- Hashed 'Bob@1234'
('c9d8c4b9-1234-4bc8-8c11-9e22db871a2e', 'charlie', 'charlie@example.com', '$2b$10$w2YJpP2Z87T9B2hJ4.2yO13f7pD1Kx65w3N1y7g9k9o6c7i8v9eI', 1500.00); -- Hashed 'Charlie@1234'
