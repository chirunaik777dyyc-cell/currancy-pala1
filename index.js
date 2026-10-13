import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist");

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") {
    console.error("JWT_SECRET must be set to a random secret of at least 32 characters.");
    process.exit(1);
  }
  console.warn("Development only: set JWT_SECRET in .env before deploying.");
}
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Configure PostgreSQL and set DATABASE_URL.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(24) NOT NULL UNIQUE,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      sender_id BIGINT REFERENCES users(id),
      recipient_id BIGINT REFERENCES users(id),
      amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
      note VARCHAR(140) NOT NULL DEFAULT '',
      kind VARCHAR(20) NOT NULL CHECK (kind IN ('transfer','welcome')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS transactions_sender_created ON transactions(sender_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS transactions_recipient_created ON transactions(recipient_id, created_at DESC);
  `);
}

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(10).max(72)
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(1).max(72)
});
const transferSchema = z.object({
  recipient: z.string().trim().min(3).max(254),
  amount: z.union([z.string(), z.number()]).transform(v => String(v)).refine(v => /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter an amount with up to 2 decimal places."),
  note: z.string().trim().max(140).optional().default("")
});

function createToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET || "dev-only-secret-change-me", { expiresIn: "7d", issuer: "pala-currency" });
}
function safeUser(user) {
  return { id: String(user.id), username: user.username, email: user.email, createdAt: user.created_at };
}
function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET || "dev-only-secret-change-me", { issuer: "pala-currency" });
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, service: "Pala Currency API", currency: "PAL", symbol: "PA" });
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Check your details." });
  const { username, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,created_at",
      [username, email, passwordHash]
    );
    const user = inserted.rows[0];
    // Demo-only starting credits. These have no cash value.
    await client.query("INSERT INTO wallets(user_id,balance) VALUES($1,1000.00)", [user.id]);
    await client.query(
      "INSERT INTO transactions(sender_id,recipient_id,amount,note,kind) VALUES(NULL,$1,1000.00,'Welcome to Pala — demo credits only','welcome')",
      [user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ token: createToken(user), user: safeUser(user), balance: "1000.00" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "That username or email is already registered." });
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  const result = await pool.query("SELECT id,username,email,password_hash,created_at FROM users WHERE email=$1", [parsed.data.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  res.json({ token: createToken(user), user: safeUser(user) });
}));

app.get("/api/me", authRequired, asyncRoute(async (req, res) => {
  const result = await pool.query(`
    SELECT u.id,u.username,u.email,u.created_at,w.balance,w.updated_at
    FROM users u JOIN wallets w ON w.user_id=u.id WHERE u.id=$1
  `, [req.userId]);
  if (!result.rowCount) return res.status(404).json({ error: "Account not found." });
  const row = result.rows[0];
  res.json({
    user: safeUser(row),
    wallet: { balance: row.balance, currency: "PAL", symbol: "PA", updatedAt: row.updated_at }
  });
}));

app.get("/api/transactions", authRequired, asyncRoute(async (req, res) => {
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 25;
  const result = await pool.query(`
    SELECT t.id,t.sender_id,t.recipient_id,t.amount,t.note,t.kind,t.created_at,
      su.username AS sender_username, ru.username AS recipient_username
    FROM transactions t
    LEFT JOIN users su ON su.id=t.sender_id
    LEFT JOIN users ru ON ru.id=t.recipient_id
    WHERE t.sender_id=$1 OR t.recipient_id=$1
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $2
  `, [req.userId, limit]);
  res.json({ transactions: result.rows.map(t => ({
    id: String(t.id),
    direction: t.kind === "welcome" ? "welcome" : String(t.sender_id) === String(req.userId) ? "sent" : "received",
    amount: t.amount,
    note: t.note,
    kind: t.kind,
    counterparty: t.kind === "welcome" ? "Pala" : (String(t.sender_id) === String(req.userId) ? t.recipient_username : t.sender_username),
    createdAt: t.created_at
  })) });
}));

app.post("/api/transfers", authRequired, asyncRoute(async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Check transfer details." });
  const { recipient, amount, note } = parsed.data;
  if (Number(amount) <= 0 || !Number.isFinite(Number(amount))) return res.status(400).json({ error: "Amount must be greater than zero." });
  if (Number(amount) > 1000000000) return res.status(400).json({ error: "Amount exceeds the demo transfer limit." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipientResult = await client.query(
      "SELECT id,username FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1) LIMIT 1",
      [recipient]
    );
    const target = recipientResult.rows[0];
    if (!target) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Recipient not found. Check their username or email." }); }
    if (String(target.id) === String(req.userId)) { await client.query("ROLLBACK"); return res.status(400).json({ error: "You cannot send Pala to yourself." }); }

    const sourceWallet = await client.query("SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", [req.userId]);
    if (!sourceWallet.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Your wallet was not found." }); }
    if (Number(sourceWallet.rows[0].balance) < Number(amount)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient Pala balance." });
    }
    const targetWallet = await client.query("SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE", [target.id]);
    if (!targetWallet.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Recipient wallet was not found." }); }

    await client.query("UPDATE wallets SET balance=balance-$1::numeric,updated_at=NOW() WHERE user_id=$2", [amount, req.userId]);
    await client.query("UPDATE wallets SET balance=balance+$1::numeric,updated_at=NOW() WHERE user_id=$2", [amount, target.id]);
    const tx = await client.query(
      "INSERT INTO transactions(sender_id,recipient_id,amount,note,kind) VALUES($1,$2,$3,$4,'transfer') RETURNING id,amount,created_at",
      [req.userId, target.id, amount, note]
    );
    const newBalance = await client.query("SELECT balance FROM wallets WHERE user_id=$1", [req.userId]);
    await client.query("COMMIT");
    res.status(201).json({ message: "Pala transfer completed.", transaction: { id: String(tx.rows[0].id), amount: tx.rows[0].amount, createdAt: tx.rows[0].created_at }, balance: newBalance.rows[0].balance });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.patch("/api/profile", authRequired, asyncRoute(async (req, res) => {
  const schema = z.object({ username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username must be 3–24 letters, numbers, or underscores." });
  try {
    const result = await pool.query("UPDATE users SET username=$1 WHERE id=$2 RETURNING id,username,email,created_at", [parsed.data.username, req.userId]);
    res.json({ user: safeUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That username is already taken." });
    throw error;
  }
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use(express.static(clientDist, { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), err => { if (err) next(err); });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`Pala Currency running on port ${PORT}`));
}).catch(error => {
  console.error("Database initialization failed:", error);
  process.exit(1);
});
