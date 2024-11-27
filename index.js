import express from "express";
import mysql from "mysql2";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config(); // Загрузка переменных окружения из .env

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'https://task4-client-1.vercel.app', // Укажите ваш фронтенд-домен
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true // Если используются cookies или авторизация
}));

const db = mysql.createConnection({
  host: "bt8onh8k8r2wwatrouru-mysql.services.clever-cloud.com",
  user: "unrznscdq4oweozs",
  password: "EG50Akg2qeBtk0avHile",
  database: "bt8onh8k8r2wwatrouru",
  waitForConnections: true,
  connectionLimit: 5, // Максимальное количество соединений в пуле
  queueLimit: 0,
});
const PORT = process.env.PORT || 8081;
const SECRET_KEY = "123";

const updateLastLogin = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = "UPDATE users SET last_login = NOW() WHERE id = ?";
    db.query(sql, [userId], (err) => {
      if (err) {
        console.error("Error updating last login:", err);
        return reject(err);
      }
      resolve();
    });
  });
};

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Извлекаем токен из заголовка Authorization
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Token is required" });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ Status: "Error", message: "Invalid token" });
    }

    req.user = user; // Сохраняем информацию о пользователе в запросе
    next();
  });
};

app.post("/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Генерация JWT токена для нового пользователя
  const token = jwt.sign({ username, email }, SECRET_KEY, { expiresIn: "7d" });

  const sql = "INSERT INTO users (`username`, `email`, `password`, `status`, `token`) VALUES (?)";
  const values = [username, email, password, "active", token];

  db.query(sql, [values], (err) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Email is already in use." });
      }
      console.error(err); // Вывод ошибки в консоль
      return res.status(500).json({ message: "Database error" });
    }
    return res.status(201).json({ message: "User registered successfully", token });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(sql, [email, password], async (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ Status: "Error", message: "Internal server error" });
    }

    if (result.length === 0) {
      return res.status(401).json({ Status: "Error", message: "Invalid email or password" });
    }

    const user = result[0];

    // Если аккаунт заблокирован
    if (user.status === "blocked") {
      return res.status(403).json({ Status: "Error", message: "Account is blocked" });
    }

    // Генерация JWT токена
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: "7d" });

    try {
      // Обновление времени последнего входа
      await updateLastLogin(user.id);
    } catch (updateError) {
      console.error("Failed to update last login time:", updateError);
      return res.status(500).json({ Status: "Error", message: "Failed to update last login time" });
    }

    res.status(200).json({
      Status: "Success",
      token,
      User: {
        id: user.id,
        email: user.email,
        status: user.status,
      },
    });
  });
});

app.post("/users/block", authenticateToken, (req, res) => {
  const { emails } = req.body; // Получаем 'emails' из тела запроса

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ message: "Invalid request. 'emails' must be a non-empty array." });
  }

  const userEmail = req.user.email; // Получаем email текущего пользователя

  // Проверяем, не пытается ли пользователь заблокировать свой собственный аккаунт

  const blockSql = "UPDATE users SET status = 'blocked' WHERE email IN (?)";
  db.query(blockSql, [emails], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    const affectedRows = result.affectedRows;

    const fetchAllUsersSql = "SELECT id, username AS name, email, last_login AS lastLogin, status FROM users";
    db.query(fetchAllUsersSql, (err, allUsersResult) => {
      if (err) {
        console.error("Error fetching updated users:", err);
        return res.status(500).json({ message: "Error fetching updated user list." });
      }

      res.status(200).json({ message: `${affectedRows} users blocked successfully.`, users: allUsersResult });
    });
  });
});

app.get('/users', authenticateToken, (req, res) => {
  const sql = "SELECT id, username AS name, email, last_login AS lastLogin, status, token FROM users ORDER BY last_login DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.status(500).send("Internal server error");
    }
    res.json(result);
  });
});
 app.post("/users/unblock", (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Invalid request. 'ids' must be a non-empty array." });
    }

    const sql = `UPDATE users SET status = 'active' WHERE id IN (?)`;

    db.query(sql, [ids], (err, result) => {
      if (err) {
        console.error("Error unblocking users:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      res.status(200).json({ message: `${result.affectedRows} users unblocked successfully.` });
    });
 });

  app.post("/users/delete", authenticateToken, (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Invalid request. 'ids' must be a non-empty array." });
    }

    const deleteSql = "DELETE FROM users WHERE id IN (?)";
    db.query(deleteSql, [ids], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error." });
      }

      const affectedRows = result.affectedRows;

      if (affectedRows > 0) {
        const resetAutoIncrementSql = "ALTER TABLE users AUTO_INCREMENT = 1";
        db.query(resetAutoIncrementSql, (err) => {
          if (err) {
            console.error("Error resetting auto-increment:", err);
          }
        });
      }

      const fetchAllUsersSql = "SELECT id, username AS name, email, last_login AS lastLogin, status FROM users";
      db.query(fetchAllUsersSql, (err, allUsersResult) => {
        if (err) {
          console.error("Error fetching updated users:", err);
          return res.status(500).json({ message: "Error fetching updated user list." });
        }

        res.status(200).json({
          message: `${affectedRows} users deleted successfully.`,
          users: allUsersResult,
        });
      });
    });
  });

app.listen(PORT, () => {
  console.log("Server is running on port 8081");
});