import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import jwt from "jsonwebtoken";

// Настройки сервера
const app = express();
const PORT = process.env.PORT || 8081;
const SECRET_KEY = process.env.SECRET_KEY || "123";

app.use(express.json());
app.use(
  cors({
    origin: "https://task4-client-cjwx.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const db = mysql.createPool({
  host: process.env.DB_HOST || "bt8onh8k8r2wwatrouru-mysql.services.clever-cloud.com",
  user: process.env.DB_USER || "unrznscdq4oweozs",
  password: process.env.DB_PASSWORD || "EG50Akg2qeBtk0avHile",
  database: process.env.DB_NAME || "bt8onh8k8r2wwatrouru",
  waitForConnections: true,
  connectionLimit: 10,
});

const USER_STATUSES = {
  ACTIVE: "active",
  BLOCKED: "blocked",
};

const executeQuery = async (query, params = []) => {
  try {
    const [rows] = await db.query(query, params);
    return rows;
  } catch (err) {
    console.error("Database error:", err);
    throw new Error("Internal server error");
  }
};

const handleError = (err, res) => {
  console.error(err.message || "Internal server error");
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
};

const updateLastLogin = async (userId) => {
  const sql = "UPDATE users SET last_login = NOW() WHERE id = ?";
  await executeQuery(sql, [userId]);
};

const authenticateToken = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token is required" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const sql = "SELECT id FROM users WHERE id = ? AND token = ?";
    const users = await executeQuery(sql, [decoded.id, token]);

    if (users.length === 0) {
      return res.status(403).json({ message: "Invalid token or user not found" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: "Invalid token" });
  }
};

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const token = jwt.sign({ username, email }, SECRET_KEY, { expiresIn: "7d" });

  const sql = "INSERT INTO users (`username`, `email`, `password`, `status`, `token`) VALUES (?)";
  const values = [username, email, password, USER_STATUSES.ACTIVE, token];

  try {
    await executeQuery(sql, [values]);
    res.status(201).json({ message: "User registered successfully", token });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      res.status(409).json({ message: "Email is already in use." });
    } else {
      handleError(err, res);
    }
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  try {
    const users = await executeQuery(sql, [email, password]);

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    if (user.status === USER_STATUSES.BLOCKED) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: "7d" });
    await updateLastLogin(user.id);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
      },
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/users", authenticateToken, async (req, res) => {
  const sql = "SELECT id, username AS name, email, last_login AS lastLogin, status FROM users ORDER BY last_login DESC";
  try {
    const users = await executeQuery(sql);
    res.json(users);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/users/block", authenticateToken, async (req, res) => {
  const { emails } = req.body;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ message: "'emails' must be a non-empty array." });
  }

  const sql = "UPDATE users SET status = ? WHERE email IN (?)";
  try {
    const result = await executeQuery(sql, [USER_STATUSES.BLOCKED, emails]);
    const users = await executeQuery("SELECT id, username AS name, email, last_login AS lastLogin, status FROM users");
    res.status(200).json({ message: `${result.affectedRows} users blocked successfully.`, users });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/users/unblock", authenticateToken, async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "'ids' must be a non-empty array." });
  }

  const sql = "UPDATE users SET status = ? WHERE id IN (?)";
  try {
    const result = await executeQuery(sql, [USER_STATUSES.ACTIVE, ids]);
    res.status(200).json({ message: `${result.affectedRows} users unblocked successfully.` });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/users/delete", authenticateToken, async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "'ids' must be a non-empty array." });
  }

  const sql = "DELETE FROM users WHERE id IN (?)";
  try {
    const result = await executeQuery(sql, [ids]);
    const users = await executeQuery("SELECT id, username AS name, email, last_login AS lastLogin, status FROM users");
    res.status(200).json({ message: `${result.affectedRows} users deleted successfully.`, users });
  } catch (err) {
    handleError(err, res);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
