import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = resolve(__dirname, "drizzle/0000_glorious_master_chief.sql");

const url = process.env.DATABASE_URL || "postgres://localhost:5432/placeholder";
const { Pool } = pg;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const sql = readFileSync(sqlFile, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }
    console.log("Migration applied successfully");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
