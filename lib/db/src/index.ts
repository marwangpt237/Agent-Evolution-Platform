import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.NODE_ENV === "production") {
  console.warn("DATABASE_URL is not set in production. The application will likely fail when accessing the database.");
}

export const pool = new Pool({ 
  connectionString: databaseUrl || "postgres://localhost:5432/placeholder" 
});
export const db = drizzle(pool, { schema });

export * from "./schema";
