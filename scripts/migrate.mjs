import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sslMode = process.env.DATABASE_SSL;
const ssl = sslMode === "require" || sslMode === "true"
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" }
  : undefined;

const pool = new pg.Pool({ connectionString, ssl });
const db = drizzle(pool);
const here = path.dirname(fileURLToPath(import.meta.url));

await migrate(db, { migrationsFolder: path.join(here, "drizzle") });
await pool.end();
console.log("Migrations applied.");
