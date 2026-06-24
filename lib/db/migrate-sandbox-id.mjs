import pg from "pg";

const url = process.env.DATABASE_URL || "postgres://localhost:5432/placeholder";
const { Pool } = pg;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    await pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sandbox_id TEXT");
    console.log("Added sandbox_id column to sessions table");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
