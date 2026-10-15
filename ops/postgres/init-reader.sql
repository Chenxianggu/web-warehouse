\getenv reader_password GRAFANA_READER_PASSWORD
\getenv db_name PGDATABASE
BEGIN;
-- Refuse to repurpose a pre-existing unrelated role or the database owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_log_reader'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      OR shobj_description(oid, 'pg_authid') IS DISTINCT FROM 'warehouse-observability-reader')) THEN
    RAISE EXCEPTION 'warehouse_log_reader exists and is not a managed audit-only role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member =
    (SELECT oid FROM pg_roles WHERE rolname = 'warehouse_log_reader')) THEN
    RAISE EXCEPTION 'warehouse_log_reader must not be a member of any other role';
  END IF;
END;
$$;
SELECT 'CREATE ROLE warehouse_log_reader' WHERE NOT EXISTS
  (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_log_reader') \gexec
COMMENT ON ROLE warehouse_log_reader IS 'warehouse-observability-reader';
ALTER ROLE warehouse_log_reader WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD :'reader_password';
ALTER ROLE warehouse_log_reader SET default_transaction_read_only = on;
ALTER ROLE warehouse_log_reader SET statement_timeout = '10s';
ALTER ROLE warehouse_log_reader SET lock_timeout = '3s';
ALTER ROLE warehouse_log_reader SET search_path = observability;
REVOKE ALL ON SCHEMA public FROM warehouse_log_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM warehouse_log_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA observability FROM warehouse_log_reader;
REVOKE ALL ON DATABASE :"db_name" FROM warehouse_log_reader;
GRANT CONNECT ON DATABASE :"db_name" TO warehouse_log_reader;
GRANT USAGE ON SCHEMA observability TO warehouse_log_reader;
GRANT SELECT ON observability.events TO warehouse_log_reader;
COMMIT;
