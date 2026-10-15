-- The developer console sees only this view, never business tables or credentials.
CREATE SCHEMA IF NOT EXISTS observability;
REVOKE ALL ON SCHEMA observability FROM PUBLIC;
CREATE VIEW observability.events AS
SELECT id, created_at, category, level, status, module, action,
       entity_type, entity_id, actor_id, actor_name, request_id, message,
       "before"::text AS before_json, "after"::text AS after_json,
       metadata::text AS metadata_json
FROM public.system_logs;
