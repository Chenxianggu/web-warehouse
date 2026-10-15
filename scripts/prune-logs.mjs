import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const days = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 36500) throw new Error(`${name} 必须为 1–36500 的整数`);
  return value;
};
const auditDays = days("AUDIT_LOG_RETENTION_DAYS", 180);
const runtimeDays = days("RUNTIME_LOG_RETENTION_DAYS", 30);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未配置");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const predicate = `(category IN ('AUDIT', 'AUTH') AND created_at < NOW() - $1 * INTERVAL '1 day') OR (category = 'SYSTEM' AND created_at < NOW() - $2 * INTERVAL '1 day')`;
try {
  const { rows } = await client.query(`SELECT category, COUNT(*)::int AS count FROM system_logs WHERE ${predicate} GROUP BY category`, [auditDays, runtimeDays]);
  console.info(JSON.stringify({ mode: apply ? "apply" : "dry-run", auditDays, runtimeDays, eligible: rows }));
  if (apply) {
    let deleted = 0;
    while (true) {
      await client.query("BEGIN");
      await client.query("SET LOCAL rz.log_maintenance = 'on'");
      const result = await client.query(`DELETE FROM system_logs WHERE id IN (SELECT id FROM system_logs WHERE ${predicate} ORDER BY id LIMIT 5000)`, [auditDays, runtimeDays]);
      await client.query("COMMIT");
      deleted += result.rowCount;
      if (result.rowCount < 5000) break;
    }
    await client.query("INSERT INTO system_logs(category,module,action,message,metadata) VALUES ('SYSTEM','系统运行','PRUNE','按保留期限清理日志',$1::jsonb)", [JSON.stringify({ auditDays, runtimeDays, deleted })]);
    console.info(JSON.stringify({ deleted }));
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ action: "PRUNE_FAILED", code: error.code ?? "UNKNOWN", message: "日志清理失败" }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
