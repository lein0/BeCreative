import { pool } from "@/lib/db";

export async function GET() {
  try {
    await pool.query("select 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
