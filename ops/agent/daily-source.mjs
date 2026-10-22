import { readFile } from "node:fs/promises";

export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export const shanghaiDay = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const previousDate = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export function reportDateAllowed(date, now = Date.now()) {
  return validDate(date) && date < shanghaiDay(now) && Date.parse(`${shanghaiDay(now)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`) <= 90 * 86400000;
}
export function dueDate(now = Date.now(), at = "08:00") {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new Error("INVALID_DAILY_REPORT_TIME");
  const local = new Date(now + 8 * 3600000).toISOString();
  return local.slice(11, 16) >= at ? previousDate(local.slice(0, 10)) : null;
}

const metricFields = `
  'orders', COALESCE(SUM(order_count),0)::text,
  'packs', COALESCE(SUM(packs),0)::text,
  'tons', ROUND(COALESCE(SUM(tons),0),6)::text,
  'amount', ROUND(COALESCE(SUM(amount),0),2)::text,
  'shippedOrders', COALESCE(SUM(order_count) FILTER (WHERE is_shipped),0)::text,
  'unshippedOrders', COALESCE(SUM(order_count) FILTER (WHERE NOT is_shipped),0)::text,
  'zeroPriceLines', COALESCE(SUM(zero_price_lines),0)::text,
  'defaultConversionLines', COALESCE(SUM(default_conversion_lines),0)::text,
  'ambiguousMaterialLines', COALESCE(SUM(ambiguous_material_lines),0)::text`;

// Fixed, parameterized queries against aggregate views. No arbitrary SQL tool.
export const DAILY_QUERY = `
WITH day_rows AS MATERIALIZED (SELECT * FROM reporting.customer_order_totals WHERE order_date = $1::date),
customers AS (
  SELECT customer_code, MAX(customer_name) AS customer_name,
    jsonb_build_object(${metricFields}) AS metrics
  FROM day_rows GROUP BY customer_code
), back_rows AS (SELECT * FROM reporting.customer_order_totals WHERE NOT is_shipped AND order_date <= $1::date)
SELECT jsonb_build_object(
  'version',1, 'reportDate',$1::date::text, 'capturedAt',transaction_timestamp(),
  'totals',(SELECT jsonb_build_object(${metricFields}, 'customers',COUNT(DISTINCT customer_code)::text) FROM day_rows),
  'backlog',(SELECT jsonb_build_object(${metricFields}) FROM back_rows),
  'customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',customer_code,'name',customer_name,'metrics',metrics) ORDER BY customer_code) FROM customers),'[]'::jsonb),
  'activity',COALESCE((SELECT jsonb_build_object(
    'createdOrders',created_orders::text,'deletedOrders',deleted_orders::text,'modifiedOrders',modified_orders::text,
    'shipOperations',ship_operations::text,'unshipOperations',unship_operations::text,
    'unattributedItemEvents',unattributed_item_events::text)
    FROM reporting.order_activity_daily WHERE day=$1::date),
    '{"createdOrders":"0","deletedOrders":"0","modifiedOrders":"0","shipOperations":"0","unshipOperations":"0","unattributedItemEvents":"0"}'::jsonb)
) AS snapshot`;

export async function collectDailySnapshot(pool, date) {
  if (!validDate(date)) throw new Error("INVALID_REPORT_DATE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await client.query(DAILY_QUERY, [date]);
    const snapshot = result.rows[0]?.snapshot;
    if (snapshot?.version !== 1 || snapshot.reportDate !== date || !Array.isArray(snapshot.customers)
      || snapshot.customers.length > 5000) throw new Error("INVALID_ORDER_SNAPSHOT");
    snapshot.capturedAt = new Date(snapshot.capturedAt).toISOString();
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function createReportPool() {
  const { default: pg } = await import("pg");
  const password = (await readFile(process.env.ORDER_REPORTER_PASSWORD_FILE ?? "/run/secrets/order_reporter_password", "utf8")).trim();
  if (password.length < 16) throw new Error("INVALID_ORDER_READER_SECRET");
  return new pg.Pool({ host: process.env.AUDIT_DB_HOST ?? "warehouse-db", port: 5432,
    database: process.env.AUDIT_DB_NAME ?? "warehouse", user: "warehouse_order_reporter", password,
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, query_timeout: 15000,
    options: "-c default_transaction_read_only=on -c statement_timeout=10000", application_name: "warehouse-order-daily" });
}
