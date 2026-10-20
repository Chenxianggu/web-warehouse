import { Pool } from "pg";

const globalForHealth = globalThis as typeof globalThis & { healthPool?: Pool };

export async function checkDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  const pool = globalForHealth.healthPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, connectionTimeoutMillis: 1500, query_timeout: 2000,
    statement_timeout: 1500, idleTimeoutMillis: 10000, allowExitOnIdle: true,
  });
  // Pool idle disconnects are expected during database outages.
  if (pool.listenerCount("error") === 0) pool.on("error", () => {});
  await pool.query("SELECT 1");
}

export async function healthResponse(check: () => Promise<void> = checkDatabase): Promise<Response> {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    await check();
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
