import express from "express";
import mysql from "mysql2";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config(); // Загрузка переменных окружения из .env

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const PORT = process.env.PORT || 8081;
const SECRET_KEY = process.env.SECRET_KEY;

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
