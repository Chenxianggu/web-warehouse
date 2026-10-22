\getenv reporter_password ORDER_REPORTER_PASSWORD
\getenv db_name PGDATABASE
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_order_reporter'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      OR shobj_description(oid, 'pg_authid') IS DISTINCT FROM 'warehouse-order-report-reader')) THEN
    RAISE EXCEPTION 'warehouse_order_reporter exists and is not a managed report-only role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member =
    (SELECT oid FROM pg_roles WHERE rolname = 'warehouse_order_reporter')) THEN
    RAISE EXCEPTION 'warehouse_order_reporter must not be a member of another role';
  END IF;
END;
$$;
SELECT 'CREATE ROLE warehouse_order_reporter' WHERE NOT EXISTS
  (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_order_reporter') \gexec
COMMENT ON ROLE warehouse_order_reporter IS 'warehouse-order-report-reader';
ALTER ROLE warehouse_order_reporter WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD :'reporter_password';
ALTER ROLE warehouse_order_reporter SET default_transaction_read_only = on;
ALTER ROLE warehouse_order_reporter SET statement_timeout = '10s';
ALTER ROLE warehouse_order_reporter SET lock_timeout = '2s';
ALTER ROLE warehouse_order_reporter SET search_path = reporting;
REVOKE ALL ON DATABASE :"db_name" FROM warehouse_order_reporter;
REVOKE ALL ON SCHEMA public, observability FROM warehouse_order_reporter;
REVOKE ALL ON ALL TABLES IN SCHEMA public, observability, reporting FROM warehouse_order_reporter;
GRANT CONNECT ON DATABASE :"db_name" TO warehouse_order_reporter;
GRANT USAGE ON SCHEMA reporting TO warehouse_order_reporter;
GRANT SELECT ON reporting.customer_order_totals, reporting.order_activity_daily TO warehouse_order_reporter;
COMMIT;
