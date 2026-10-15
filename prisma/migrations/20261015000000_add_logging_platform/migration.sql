CREATE TABLE "system_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "category" VARCHAR(16) NOT NULL,
  "level" VARCHAR(8) NOT NULL DEFAULT 'INFO',
  "status" VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
  "module" VARCHAR(64) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "entity_type" VARCHAR(100),
  "entity_id" VARCHAR(255),
  "actor_id" VARCHAR(100),
  "actor_name" VARCHAR(100) NOT NULL DEFAULT '系统',
  "request_id" VARCHAR(100),
  "message" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_logs_category_check" CHECK (category IN ('AUDIT', 'AUTH', 'SYSTEM')),
  CONSTRAINT "system_logs_level_check" CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  CONSTRAINT "system_logs_status_check" CHECK (status IN ('SUCCESS', 'FAILURE'))
);
CREATE INDEX "system_logs_created_at_id_idx" ON "system_logs" ("created_at" DESC, "id" DESC);
CREATE INDEX "system_logs_category_created_at_idx" ON "system_logs" ("category", "created_at" DESC);
CREATE INDEX "system_logs_module_created_at_idx" ON "system_logs" ("module", "created_at" DESC);
CREATE INDEX "system_logs_actor_id_created_at_idx" ON "system_logs" ("actor_id", "created_at" DESC);
CREATE INDEX "system_logs_request_id_idx" ON "system_logs" ("request_id");

-- Also covers bulk writes, cascades, scheduled synchronisation and direct SQL.
-- SET LOCAL context cannot leak to a later request using the pooled connection.
CREATE FUNCTION rz_capture_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  old_row JSONB;
  new_row JSONB;
  object_row JSONB;
  credential_changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME = 'users' THEN
    credential_changed := (old_row -> 'password_hash') IS DISTINCT FROM (new_row -> 'password_hash');
  END IF;
  old_row := old_row - 'password_hash' - 'session_version';
  new_row := new_row - 'password_hash' - 'session_version';
  IF TG_OP = 'UPDATE' AND (old_row - 'updated_at') = (new_row - 'updated_at') AND NOT credential_changed THEN
    RETURN NEW;
  END IF;
  object_row := COALESCE(new_row, old_row);
  INSERT INTO system_logs (category, module, action, entity_type, entity_id, actor_id, actor_name, request_id, message, "before", "after", metadata)
  VALUES ('AUDIT', TG_ARGV[0], CASE WHEN credential_changed AND TG_OP = 'UPDATE' THEN 'PASSWORD_CHANGE' ELSE TG_OP END,
    TG_TABLE_NAME, COALESCE(object_row ->> 'id', object_row ->> 'user_id', object_row ->> 'menu_key'),
    NULLIF(current_setting('rz.actor_id', TRUE), ''),
    COALESCE(NULLIF(current_setting('rz.actor_name', TRUE), ''), '系统'),
    NULLIF(current_setting('rz.request_id', TRUE), ''),
    TG_ARGV[0] || ' / ' || TG_OP, old_row, new_row,
    jsonb_build_object('credentialChanged', credential_changed));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE entry RECORD;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('users', '账号管理'), ('salesperson_menu_permissions', '菜单权限'),
    ('customers', '客户资料'), ('receiver_history', '收货地址'),
    ('materials', '库存管理'), ('inbound_records', '入库与库存'),
    ('plastic_price_tables', '价格表'), ('plastic_price_editors', '价格表授权'),
    ('orders', '客户订单'), ('order_items', '订单明细'),
    ('futures', '客户寄存'), ('payments', '应收账款'),
    ('full_container_records', '整柜销售'), ('purchase_orders', '订货管理'),
    ('purchase_order_deliveries', '采购到货')
  ) AS entries(table_name, module_name)
  LOOP
    EXECUTE format('CREATE TRIGGER rz_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION rz_capture_audit(%L)', entry.table_name, entry.module_name);
  END LOOP;
END;
$$;

-- Application code exposes no edit/delete API. Maintenance can explicitly opt in.
CREATE FUNCTION rz_protect_logs() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('rz.log_maintenance', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'System logs are append-only';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER rz_protect_logs BEFORE UPDATE OR DELETE ON system_logs FOR EACH ROW EXECUTE FUNCTION rz_protect_logs();
