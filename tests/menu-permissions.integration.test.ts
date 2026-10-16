import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { getMenuPermissionGroups, getVisibleNavigation } from "../src/server/menu-permissions";
import { auditTransaction } from "../src/server/audit";

test("personal permissions persist, isolate users, audit changes and reset to defaults", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const username = `menu-test-${randomUUID().slice(0, 8)}`;
  const first = await db.user.create({ data: { username, passwordHash: "unused" } });
  const second = await db.user.create({ data: { username: `${username}-2`, passwordHash: "unused" } });
  const paths = async (id: string) => (await getVisibleNavigation(id, "SALESPERSON")).flatMap((g) => g.items.map((i) => i.href));
  try {
    const inherited = await paths(first.id);
    assert.deepEqual(await paths(second.id), inherited);
    await auditTransaction(first, (tx) => tx.userMenuPermission.create({ data: { userId: first.id, menuKeys: ["/stock"] } }));
    assert.deepEqual(await paths(first.id), ["/", "/stock"]);
    assert.deepEqual(await paths(second.id), inherited);
    const config = await getMenuPermissionGroups(first.id);
    assert.equal(config.isCustom, true);
    assert.deepEqual(config.groups.flatMap((g) => g.items.filter((i) => i.isVisible).map((i) => i.href)), ["/stock"]);
    assert.ok((await getVisibleNavigation(first.id, "SUPER_ADMIN")).some((g) => g.items.some((i) => i.href === "/users")));
    await db.userMenuPermission.update({ where: { userId: first.id }, data: { menuKeys: [] } });
    assert.deepEqual(await paths(first.id), ["/"]);
    assert.equal((await getMenuPermissionGroups(first.id)).isCustom, true);
    await db.userMenuPermission.delete({ where: { userId: first.id } });
    assert.deepEqual(await paths(first.id), inherited);
    assert.equal((await getMenuPermissionGroups(first.id)).isCustom, false);
    const log = await db.systemLog.findFirst({ where: { entityType: "user_menu_permissions", entityId: first.id, action: "INSERT" } });
    assert.equal(log?.actorId, first.id);
    await db.userMenuPermission.create({ data: { userId: second.id, menuKeys: [] } });
    await db.user.delete({ where: { id: second.id } });
    assert.equal(await db.userMenuPermission.count({ where: { userId: second.id } }), 0);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    await db.$disconnect();
  }
});
