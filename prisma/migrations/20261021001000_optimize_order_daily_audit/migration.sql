-- Filter the retained audit history by Shanghai business day, and hash-join
-- transaction headers rather than scanning all history once per item event.
CREATE INDEX system_logs_order_daily_idx ON public.system_logs
  (((created_at AT TIME ZONE 'Asia/Shanghai')::date), request_id)
  WHERE category = 'AUDIT' AND entity_type IN ('orders', 'order_items');

CREATE OR REPLACE VIEW reporting.order_activity_daily AS
WITH events AS NOT MATERIALIZED (
  SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
    entity_type, action, NULLIF(request_id, '') AS request_id,
    CASE WHEN entity_type = 'orders' THEN COALESCE("after"->>'id', "before"->>'id')
      ELSE COALESCE("after"->>'order_id', "before"->>'order_id') END AS order_id,
    "before", "after"
  FROM public.system_logs
  WHERE category = 'AUDIT' AND entity_type IN ('orders', 'order_items')
), headers AS (
  SELECT DISTINCT day, order_id, request_id FROM events
  WHERE entity_type = 'orders' AND action IN ('INSERT', 'DELETE') AND request_id IS NOT NULL
), classified AS (
  SELECT e.*,
    (e.entity_type = 'orders' AND e.action = 'UPDATE'
      AND (e."before" - 'is_shipped') IS DISTINCT FROM (e."after" - 'is_shipped'))
    OR (e.entity_type = 'order_items' AND e.request_id IS NOT NULL AND h.order_id IS NULL) AS is_edit
  FROM events e LEFT JOIN headers h ON h.day = e.day AND h.order_id = e.order_id AND h.request_id = e.request_id
)
SELECT day,
  COUNT(DISTINCT order_id) FILTER (WHERE entity_type = 'orders' AND action = 'INSERT') AS created_orders,
  COUNT(DISTINCT order_id) FILTER (WHERE entity_type = 'orders' AND action = 'DELETE') AS deleted_orders,
  COUNT(DISTINCT order_id) FILTER (WHERE is_edit) AS modified_orders,
  COUNT(*) FILTER (WHERE entity_type = 'orders' AND action = 'UPDATE'
    AND "before"->>'is_shipped' = 'false' AND "after"->>'is_shipped' = 'true') AS ship_operations,
  COUNT(*) FILTER (WHERE entity_type = 'orders' AND action = 'UPDATE'
    AND "before"->>'is_shipped' = 'true' AND "after"->>'is_shipped' = 'false') AS unship_operations,
  COUNT(*) FILTER (WHERE entity_type = 'order_items' AND request_id IS NULL) AS unattributed_item_events
FROM classified GROUP BY day;
