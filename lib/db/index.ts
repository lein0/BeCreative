import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import { pgSsl } from "@/lib/env";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: pgSsl() });

export const db = drizzle(pool, { schema });
export { pool };
