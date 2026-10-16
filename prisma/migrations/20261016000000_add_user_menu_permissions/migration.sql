CREATE TABLE "user_menu_permissions" (
  "user_id" TEXT NOT NULL PRIMARY KEY,
  "menu_keys" TEXT[] NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_menu_permissions_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TRIGGER rz_audit AFTER INSERT OR UPDATE OR DELETE ON "user_menu_permissions"
  FOR EACH ROW EXECUTE FUNCTION rz_capture_audit('用户菜单权限');
