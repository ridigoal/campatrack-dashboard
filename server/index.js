"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const sql = require("mssql/msnodesqlv8");

const PORT = Number(process.env.PORT || 3000);

const config = {
  connectionString:
    (typeof process.env.DB_CONNECTION_STRING === "string" && process.env.DB_CONNECTION_STRING.trim()) ||
    [
      "Driver={ODBC Driver 18 for SQL Server}",
      "Server=localhost",
      "Database=marketing_db",
      "Trusted_Connection=yes",
      "TrustServerCertificate=yes",
    ].join(";"),
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).then((pool) => {
      console.log("Conectado a SQL Server correctamente");
      return pool;
    });
  }
  return poolPromise;
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));

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

/**
 * Guarda el bundle de campaña en SQL Server (misma conexión que login y GET /api/data).
 * Cuerpo esperado: { user_id, data } — `data` puede ser objeto o JSON ya serializado.
 */
async function handlePostCampaignData(req, res) {
  try {
    const user_id =
      typeof req.body?.user_id === "string"
        ? req.body.user_id.trim()
        : String(req.body?.user_id ?? "").trim();
    const data = req.body?.data;

    if (!user_id || data === undefined || data === null) {
      return res.status(400).json({ error: "user_id y data son requeridos" });
    }

    const replace =
      req.query?.replace === "1" ||
      req.query?.replace === "true" ||
      req.body?.replace_user_campaign_data === true;

    const pool = await getPool();

    if (replace) {
      await pool
        .request()
        .input("user_id", sql.VarChar(255), user_id)
        .query(`DELETE FROM campaign_data WHERE user_id = @user_id`);
    }

    const dataPayload = typeof data === "string" ? data : JSON.stringify(data);

    await pool
      .request()
      .input("user_id", sql.VarChar(255), user_id)
      .input("data", sql.NVarChar(sql.MAX), dataPayload)
      .query(
        `INSERT INTO campaign_data (user_id, data, created_at)
         VALUES (@user_id, @data, GETDATE())`
      );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error guardando data:", error);
    res.status(500).json({ error: "Error guardando data" });
  }
}

app
  .route("/api/data")
  .get(async (req, res) => {
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
        return res.json({ data: null });
      }

      let raw =
        row.data !== undefined && row.data !== null
          ? row.data
          : row.DATA !== undefined && row.DATA !== null
            ? row.DATA
            : null;

      if (raw === null || raw === "") {
        return res.json({ data: null });
      }

      if (Buffer.isBuffer(raw)) {
        raw = raw.toString("utf8");
      }

      /** Acepta objeto ya parseado por el driver o string JSON; desenrolla doble serialización. */
      let data = raw;
      if (typeof data === "string") {
        for (let i = 0; i < 4 && typeof data === "string"; i++) {
          const s = data.trim();
          if (!s) {
            data = null;
            break;
          }
          try {
            data = JSON.parse(s);
          } catch (_parseErr) {
            return res.status(500).json({ error: "El campo data almacenado no es JSON válido" });
          }
        }
      }

      if (data == null || typeof data !== "object" || Array.isArray(data)) {
        return res.status(500).json({ error: "Formato de data inesperado" });
      }

      // Devolver el mismo objeto guardado en BD (planning_data, data_general, relaciones, …), sin reconstruir claves.
      console.log("DATA DEVUELTA:", data);
      return res.json({ data });
    } catch (err) {
      console.error("GET /api/data", err);
      res.status(500).json({ success: false, message: "Error del servidor" });
    }
  })
  .post(handlePostCampaignData);

app.post("/api/save-all", handlePostCampaignData);

/**
 * Desenrolla un backup descargado con GET /api/data (`{ data: bundle }`) al objeto `bundle`
 * que se persiste en columna (mismo formato que POST /api/data / save-all).
 */
function normalizeImportBodyForDb(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return data;
  if (!Object.prototype.hasOwnProperty.call(data, "data")) return data;
  const inner = data.data;
  if (inner == null || typeof inner !== "object" || Array.isArray(inner)) return data;
  const hints = [
    "planning_data",
    "data_general",
    "cc_data",
    "programs",
    "relaciones",
    "bitacora_data",
    "data_ads_report",
    "data_anuncios",
    "catalogos_sistema"
  ];
  const innerLooksBundle = hints.some((k) => Object.prototype.hasOwnProperty.call(inner, k));
  const topLooksBundle = hints.some((k) => Object.prototype.hasOwnProperty.call(data, k));
  if (innerLooksBundle && !topLooksBundle) return inner;
  return data;
}

/** Reemplaza por completo la fila de campaña del usuario (sin transformar el bundle salvo unwrap de export). */
app.post("/api/import-data", async (req, res) => {
  try {
    const user_id =
      typeof req.body?.user_id === "string"
        ? req.body.user_id.trim()
        : String(req.body?.user_id ?? "").trim();
    let data = req.body?.data;

    if (!user_id || data === undefined || data === null) {
      return res.status(400).json({ ok: false, error: "user_id y data son requeridos" });
    }

    const toStore = normalizeImportBodyForDb(data);
    if (toStore == null || typeof toStore !== "object" || Array.isArray(toStore)) {
      return res.status(400).json({ ok: false, error: "data debe ser un objeto JSON" });
    }

    const pool = await getPool();
    const dataPayload = typeof toStore === "string" ? toStore : JSON.stringify(toStore);

    await pool.request().input("user_id", sql.VarChar(255), user_id).query(`DELETE FROM campaign_data WHERE user_id = @user_id`);

    await pool
      .request()
      .input("user_id", sql.VarChar(255), user_id)
      .input("data", sql.NVarChar(sql.MAX), dataPayload)
      .query(
        `INSERT INTO campaign_data (user_id, data, created_at)
         VALUES (@user_id, @data, GETDATE())`
      );

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/import-data", err);
    res.status(500).json({ ok: false, error: "Error importando data" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`CampaTrack API escuchando en http://localhost:${PORT}`);
  console.log("Rutas: POST /api/login | GET+POST /api/data | POST /api/save-all | POST /api/import-data");
  void getPool().catch((e) => {
    console.error("No se pudo conectar a SQL Server al arranque:", e?.message || e);
  });
});

server.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
