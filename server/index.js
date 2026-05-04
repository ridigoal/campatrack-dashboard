"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sql = require("mssql");

const PORT = Number(process.env.PORT || 3000);

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER || "localhost",
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: String(process.env.SQL_ENCRYPT || "").toLowerCase() === "true",
    trustServerCertificate: true
  }
};

let poolPromise;
function getPool() {
  if (!poolPromise) poolPromise = sql.connect(sqlConfig);
  return poolPromise;
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.post("/api/login", async (req, res) => {
  try {
    const username = req.body?.username;
    const password = req.body?.password;
    if (username === undefined || password === undefined || username === "" || password === "") {
      return res.status(400).json({ success: false, message: "Faltan credenciales" });
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input("username", sql.NVarChar(255), String(username))
      .input("password", sql.NVarChar(512), String(password))
      .query(
        `SELECT TOP (1) username, role FROM users
         WHERE username = @username AND password = @password`
      );
    if (!result.recordset?.length) {
      return res.status(401).json({ success: false });
    }
    const row = result.recordset[0];
    res.json({
      success: true,
      user: {
        username: String(row.username ?? ""),
        role: String(row.role ?? "").trim()
      }
    });
  } catch (err) {
    console.error("POST /api/login", err);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const user_id =
      typeof req.query.user_id === "string"
        ? req.query.user_id.trim()
        : String(req.query.user_id ?? "").trim();
    if (!user_id) {
      return res.status(400).json({ error: "Query user_id requerido" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("user_id", sql.VarChar(255), user_id)
      .query(
        `SELECT TOP (1) *
         FROM campaign_data
         WHERE user_id = @user_id
         ORDER BY created_at DESC`
      );

    const row = result.recordset?.[0];
    if (!row) {
      return res.json({});
    }

    res.json(row);
  } catch (err) {
    console.error("GET /api/data", err);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

async function handleSaveCampaignData(req, res) {
  try {
    const user_id =
      typeof req.body?.user_id === "string"
        ? req.body.user_id.trim()
        : String(req.body?.user_id ?? "").trim();
    const data = req.body?.data;

    if (!user_id || data === undefined || data === null) {
      return res.status(400).send("Datos incompletos");
    }

    const pool = await getPool();
    const dataPayload = typeof data === "string" ? data : JSON.stringify(data);

    await pool
      .request()
      .input("user_id", sql.NVarChar(255), user_id)
      .input("data", sql.NVarChar(sql.MAX), dataPayload)
      .query(
        `INSERT INTO campaign_data (user_id, data, created_at)
         VALUES (@user_id, @data, GETDATE())`
      );

    res.status(200).send("OK");
  } catch (err) {
    console.error("POST guardar campaign_data", err);
    res.status(500).send("Error guardando data");
  }
}

app.post("/api/data", handleSaveCampaignData);
app.post("/api/save-all", handleSaveCampaignData);

const server = app.listen(PORT, () => {
  console.log(`CampaTrack API escuchando en http://localhost:${PORT}`);
});

server.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
