import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT || 8081;
const SECRET_KEY = process.env.SECRET_KEY || "123";

app.use(express.json());
app.use(cors({ origin: "https://task4-client-cjwx.vercel.app", methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Content-Type", "Authorization"] }));

const db = mysql.createPool({
  host: process.env.DB_HOST || "bt8onh8k8r2wwatrouru-mysql.services.clever-cloud.com",
  user: process.env.DB_USER || "unrznscdq4oweozs",
  password: process.env.DB_PASSWORD || "EG50Akg2qeBtk0avHile",
  database: process.env.DB_NAME || "bt8onh8k8r2wwatrouru",
  waitForConnections: true,
  connectionLimit: 10,
});

const USER_STATUSES = { ACTIVE: "active", BLOCKED: "blocked" };

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ message: "Missing required fields" });

  const token = jwt.sign({ username, email }, SECRET_KEY, { expiresIn: "7d" });
  const sql = "INSERT INTO users (`username`, `email`, `password`, `status`, `token`) VALUES (?)";
  const values = [username, email, password, USER_STATUSES.ACTIVE, token];

  try {
    await db.query(sql, [values]);
    res.status(201).json({ message: "User registered successfully", token });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") res.status(409).json({ message: "Email is already in use." });
    else res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const [users] = await db.query("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
  if (!users.length) return res.status(401).json({ message: "Invalid email or password" });

  const user = users[0];
  if (user.status === USER_STATUSES.BLOCKED) return res.status(403).json({ message: "Account is blocked" });

  const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: "7d" });
  await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

  res.status(200).json({ message: "Login successful", token, user: { id: user.id, email: user.email, status: user.status } });
});

app.get("/users", async (req, res) => {
  const [users] = await db.query("SELECT id, username AS name, email, last_login AS lastLogin, status FROM users ORDER BY last_login DESC");
  res.json(users);
});

app.post("/users/block", async (req, res) => {
  const { emails } = req.body;
  if (!emails?.length) return res.status(400).json({ message: "'emails' must be a non-empty array." });

  await db.query("UPDATE users SET status = ? WHERE email IN (?)", [USER_STATUSES.BLOCKED, emails]);
  res.status(200).json({ message: "Users blocked successfully." });
});

app.post("/users/unblock", async (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ message: "'ids' must be a non-empty array." });

  await db.query("UPDATE users SET status = ? WHERE id IN (?)", [USER_STATUSES.ACTIVE, ids]);
  res.status(200).json({ message: "Users unblocked successfully." });
});

app.post("/users/delete", async (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ message: "'ids' must be a non-empty array." });

  await db.query("DELETE FROM users WHERE id IN (?)", [ids]);
  res.status(200).json({ message: "Users deleted successfully." });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
