import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "nimstreak",
        connectionTimeoutMillis: 5000,
      }
);

pool.on("error", (err) => {
  console.warn("PostgreSQL pool background warning:", err.message);
});

export const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.warn(`Database query failed (${err.message}). Text:`, text?.slice(0, 100));
    throw err;
  }
};

export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
};

export async function initDb() {
  if (!connectionString && !process.env.PGHOST) {
    console.warn("No DATABASE_URL or PGHOST configured. Running in memory / offline mode.");
    return;
  }

  try {
    const schemaPath = path.join(__dirname, "db-schema.sql");
    if (fs.existsSync(schemaPath)) {
      const sql = await fs.promises.readFile(schemaPath, "utf-8");
      await pool.query(sql);
      console.info("PostgreSQL database tables initialized successfully from db-schema.sql.");
    } else {
      console.warn("db-schema.sql not found at", schemaPath);
    }
  } catch (err) {
    console.error("Failed to initialize database tables:", err.message);
  }
}
