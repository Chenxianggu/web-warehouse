CREATE SCHEMA IF NOT EXISTS reporting;
REVOKE ALL ON SCHEMA reporting FROM PUBLIC;

-- One row per order prevents item joins from multiplying order counts.
-- These internal rows are NOT granted to the report reader.
CREATE VIEW reporting.order_metrics AS
SELECT o.id, o.order_date, o.customer_code, o.customer_name, o.is_shipped,
  COALESCE(SUM(i.pack_count), 0) AS packs,
  COALESCE(SUM(i.pack_count / CASE WHEN m.packs_per_ton > 0 THEN m.packs_per_ton ELSE 40 END::numeric), 0) AS tons,
  COALESCE(SUM(i.unit_price * i.pack_count / CASE WHEN m.packs_per_ton > 0 THEN m.packs_per_ton ELSE 40 END::numeric), 0) AS amount,
  COUNT(i.id) FILTER (WHERE i.unit_price = 0) AS zero_price_lines,
  COUNT(i.id) FILTER (WHERE m.packs_per_ton IS NULL OR m.packs_per_ton <= 0) AS default_conversion_lines,
  COUNT(i.id) FILTER (WHERE m.matches > 1) AS ambiguous_material_lines
FROM public.orders o
LEFT JOIN public.order_items i ON i.order_id = o.id
LEFT JOIN LATERAL (
  SELECT packs_per_ton, COUNT(*) OVER () AS matches
  FROM public.materials WHERE lower(trim(code)) = lower(trim(i.code))
  ORDER BY id DESC LIMIT 1
) m ON true
GROUP BY o.id;

CREATE VIEW reporting.customer_order_totals AS
SELECT order_date, customer_code, MAX(customer_name) AS customer_name, is_shipped,
  COUNT(*) AS order_count, SUM(packs) AS packs, SUM(tons) AS tons, SUM(amount) AS amount,
  SUM(zero_price_lines) AS zero_price_lines, SUM(default_conversion_lines) AS default_conversion_lines,
  SUM(ambiguous_material_lines) AS ambiguous_material_lines
FROM reporting.order_metrics
GROUP BY order_date, customer_code, is_shipped;

-- Only aggregated operation counts leave the audit store. Row snapshots and
-- operator identities are never granted to the report reader.
CREATE VIEW reporting.order_activity_daily AS
WITH events AS (
  SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
    entity_type, action, NULLIF(request_id, '') AS request_id,
    CASE WHEN entity_type = 'orders' THEN COALESCE("after"->>'id', "before"->>'id')
      ELSE COALESCE("after"->>'order_id', "before"->>'order_id') END AS order_id,
    "before", "after"
  FROM public.system_logs
  WHERE category = 'AUDIT' AND entity_type IN ('orders', 'order_items')
), classified AS (
  SELECT e.*,
    (entity_type = 'orders' AND action = 'UPDATE'
      AND ("before" - 'is_shipped') IS DISTINCT FROM ("after" - 'is_shipped'))
    OR (entity_type = 'order_items' AND request_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM events h WHERE h.entity_type = 'orders' AND h.action IN ('INSERT', 'DELETE')
        AND h.order_id = e.order_id AND h.request_id = e.request_id AND h.day = e.day
    )) AS is_edit
  FROM events e
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

REVOKE ALL ON ALL TABLES IN SCHEMA reporting FROM PUBLIC;
