import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { readDump } from './mysql-dump.mjs';

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const businessTables = ['customers', 'materials', 'inbound_records', 'orders', 'order_items', 'receiver_history', 'full_container_records', 'futures', 'payments', 'purchase_orders', 'purchase_order_deliveries'];
const menuPaths = {
  '/materials': '/stock', '/inbound': '/inbound-orders', '/outbound': '/outbound-orders',
  '/futures': '/consignments', '/customers': '/customers', '/orders': '/customer-orders',
  '/order-query': '/order-search', '/receivables': '/receivables', '/purchase-orders': '/purchase-orders',
  '/price-chart': '/price-trends', '/full-container': '/full-container-sales', '/tax-calculator': '/tax-calculator',
};

async function main() {
  const args = process.argv.slice(2);
  const source = args.find((arg) => !arg.startsWith('--'));
  if (!source) throw new Error('Usage: node scripts/replace-from-mysql.mjs dump.sql [--replace --backup=backup.dump --report=report.json]');
  const tables = readDump(source);
  for (const table of [...businessTables, 'users', 'menus', 'role_menus']) {
    if (!tables[table]) throw new Error(`Required source table missing: ${table}`);
  }
  const roles = { super_admin: 'SUPER_ADMIN', user: 'SALESPERSON' };
  for (const user of tables.users.rows) {
    if (!roles[user.role] || !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(user.password_hash)) throw new Error(`Unsupported account format: source user ${user.id}`);
  }
  if (!tables.users.rows.some((user) => roles[user.role] === 'SUPER_ADMIN')) throw new Error('No source administrator');
  const connectionString = process.env.DATABASE_URL;
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Replacement is limited to a local database');
  const report = {
    source: resolve(source), sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
    target: { host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1) },
    sourceCounts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length])),
    removedLegacyFields: ['customers.nickname (all empty)', 'orders.customer_nickname (all NULL)'],
    userIdMapping: [], verifiedTables: {}, resetSequences: {}, committed: false,
  };
  if (tables.customers.rows.some((row) => row.nickname) || tables.orders.rows.some((row) => row.customer_nickname)) throw new Error('Nonempty legacy nickname requires a mapping');
  if (!args.includes('--replace')) { console.log(JSON.stringify(report, null, 2)); return; }
  const backup = args.find((arg) => arg.startsWith('--backup='))?.slice(9);
  const reportPath = args.find((arg) => arg.startsWith('--report='))?.slice(9);
  if (!backup || !reportPath || statSync(backup).size < 100 || readFileSync(backup).subarray(0, 5).toString() !== 'PGDMP') throw new Error('A PostgreSQL custom backup and report path are required');
  report.backup = resolve(backup);
  // Ensure the report destination is writable before touching the database.
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  let inTransaction = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const publicTables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map((row) => row.tablename);
    const expectedTables = [...businessTables, 'users', 'salesperson_menu_permissions', 'plastic_price_editors', 'plastic_price_tables'];
    if (publicTables.length !== expectedTables.length || publicTables.some((table) => !expectedTables.includes(table))) throw new Error('Unexpected target tables; refusing incomplete replacement');
    const now = new Date().toISOString();
    const sourceData = Object.fromEntries(businessTables.map((name) => [name, tables[name].rows.map((row) => ({ ...row }))]));
    sourceData.futures = sourceData.futures.map((row) => {
      const history = JSON.parse(row.outbound_history ?? '[]');
      if (!Array.isArray(history)) throw new Error(`Invalid history for consignment ${row.id}`);
      return { ...row, outbound_history: JSON.stringify(history) };
    });
    sourceData.users = tables.users.rows.map((row) => {
      const id = randomUUID();
      report.userIdMapping.push({ sourceId: row.id, targetId: id, username: row.username, role: roles[row.role] });
      return { ...row, id, role: roles[row.role], is_active: true, session_version: '0', updated_at: row.created_at };
    });
    const grantedIds = new Set(tables.role_menus.rows.filter((row) => row.role_type === 'user').map((row) => row.menu_id));
    sourceData.salesperson_menu_permissions = Object.entries(menuPaths).map(([oldPath, newPath]) => {
      const menu = tables.menus.rows.find((row) => row.path === oldPath);
      if (!menu) throw new Error(`Missing source menu: ${oldPath}`);
      return { menu_key: newPath, is_visible: grantedIds.has(menu.id), updated_at: now };
    });
    const metadata = (await client.query("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows;
    const staged = [];
    for (const [table, rows] of Object.entries(sourceData)) {
      const columns = metadata.filter((column) => column.table_name === table);
      const names = columns.map((column) => column.column_name);
      const converted = rows.map((row) => columns.map((column) => {
        let value = row[column.column_name];
        if (value === undefined) throw new Error(`Unmapped column: ${table}.${column.column_name}`);
        if (value === null && column.is_nullable === 'NO') throw new Error(`Unexpected NULL: ${table}.${column.column_name}`);
        if (column.data_type === 'boolean' && value !== null && typeof value !== 'boolean') {
          if (!['0', '1'].includes(value)) throw new Error(`Invalid boolean: ${table}.${column.column_name}`);
          value = value === '1';
        }
        return value;
      }));
      const temp = `_import_${table}`;
      await client.query(`CREATE TEMP TABLE ${quote(temp)} (LIKE public.${quote(table)}) ON COMMIT DROP`);
      for (let offset = 0; offset < converted.length; offset += 500) {
        const batch = converted.slice(offset, offset + 500);
        const placeholders = batch.map((values, index) => '(' + values.map((_, n) => '$' + (index * names.length + n + 1)).join(',') + ')').join(',');
        await client.query(`INSERT INTO ${quote(temp)} (${names.map(quote).join(',')}) VALUES ${placeholders}`, batch.flat());
      }
      staged.push({ table, temp, names });
      console.log(`Staged ${table}: ${rows.length}`);
    }
    // All business tables are replaced together, retaining Prisma schema history.
    await client.query(`TRUNCATE ${publicTables.map((table) => 'public.' + quote(table)).join(',')} RESTART IDENTITY`);
    for (const { table, temp, names } of staged) {
      const fields = names.map(quote).join(',');
      await client.query(`INSERT INTO public.${quote(table)} (${fields}) SELECT ${fields} FROM ${quote(temp)}`);
      const mismatch = await client.query(`SELECT EXISTS ((SELECT ${fields} FROM public.${quote(table)} EXCEPT ALL SELECT ${fields} FROM ${quote(temp)}) UNION ALL (SELECT ${fields} FROM ${quote(temp)} EXCEPT ALL SELECT ${fields} FROM public.${quote(table)})) AS mismatch`);
      if (mismatch.rows[0].mismatch) throw new Error(`Verification failed: ${table}`);
      const decimalColumns = metadata.filter((column) => column.table_name === table && column.data_type === 'numeric').map((column) => column.column_name);
      const totals = {};
      for (const column of decimalColumns) {
        totals[column] = (await client.query(`SELECT coalesce(sum(${quote(column)}), 0)::text AS total FROM public.${quote(table)}`)).rows[0].total;
      }
      report.verifiedTables[table] = { count: sourceData[table].length, allFieldsMatch: true, totals };
    }
    for (const table of businessTables) {
      const sequence = (await client.query('SELECT pg_get_serial_sequence($1, $2) AS sequence', [`public.${table}`, 'id'])).rows[0].sequence;
      if (!sequence) throw new Error(`Missing ID sequence: ${table}`);
      const maxId = (await client.query(`SELECT coalesce(max(id), 0)::text AS max FROM public.${quote(table)}`)).rows[0].max;
      const nextId = [BigInt(maxId) + 1n, BigInt(tables[table].nextId ?? '1')].reduce((a, b) => a > b ? a : b);
      await client.query(`ALTER SEQUENCE ${sequence.split('.').map(quote).join('.')} RESTART WITH ${nextId}`);
      report.resetSequences[table] = nextId.toString();
    }
    const orphanQueries = {
      order_items: 'SELECT count(*)::int AS count FROM order_items i LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL',
      purchase_order_deliveries: 'SELECT count(*)::int AS count FROM purchase_order_deliveries d LEFT JOIN purchase_orders o ON o.id=d.order_id WHERE o.id IS NULL',
      consignment_orders: "SELECT count(*)::int AS count FROM futures f CROSS JOIN LATERAL jsonb_array_elements(f.outbound_history) h LEFT JOIN orders o ON o.id=(h->>'order_id')::int WHERE h ? 'order_id' AND o.id IS NULL",
    };
    report.orphans = {};
    for (const [name, query] of Object.entries(orphanQueries)) {
      const count = (await client.query(query)).rows[0].count;
      report.orphans[name] = count;
      if (count !== 0) throw new Error(`Orphan records found: ${name}: ${count}`);
    }
    report.clearedTables = ['plastic_price_editors', 'plastic_price_tables'];
    await client.query('COMMIT');
    inTransaction = false;
    report.committed = true;
    report.completedAt = new Date().toISOString();
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    report.error = error.message;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
