# MySQL 备份覆盖导入 PostgreSQL

`scripts/replace-from-mysql.mjs` 将当前仓库系统的 MySQL 8 `mysqldump` 数据备份转换到现有 Prisma PostgreSQL 表结构。它只解析数据字面量，不执行备份里的 SQL、`DROP TABLE` 或其他指令。

## 导入范围与兼容规则

- 覆盖客户、物料、入库、订单及明细、收货地址、整柜、寄存、付款、采购及交货数据。
- 保留业务记录 ID、历史姓名、单号、金额、数量、原始日期和寄存出库关联。不会重新执行历史出库或入库逻辑。
- 客户编号允许重复；每条档案按 ID 管理。同编号档案共享收货地址和按编号计算的应收账款。修改编号时复制地址，只有原编号不再有档案时才移除原地址；删除最后一条档案时才清理地址。历史订单不随档案变动。
- 源账号 ID 转换成 UUID，`super_admin` / `user` 转换成 `SUPER_ADMIN` / `SALESPERSON`；bcrypt 密码哈希保持原样，账号可用原密码登录。旧登录会话需要重新登录。
- 原业务员菜单授权对应到新路由。首页固定可见，用户管理和菜单管理固定仅管理员可见。
- 原备份不包含新系统的首页价格表与价格编辑授权，这两张表清空。保留 `_prisma_migrations` 和现有数据库结构。
- `customers.nickname` 和 `orders.customer_nickname` 在本次备份中分别全部为空串和 NULL，不导入。遇到非空内容会中止，避免静默丢失。
- 新增记录的 ID 序列取源 `AUTO_INCREMENT` 与最大 ID 加一的较大值，避免复用已删除记录的编号。

## 操作

先用 `pg_dump -Fc` 备份目标库，用 `pg_restore --list` 检查备份，并恢复到临时库试导入。目标库和临时库均需先执行 `prisma migrate deploy`，包括允许重复客户编号的迁移。

仅查看源数据统计，不写库：

```powershell
node scripts/replace-from-mysql.mjs D:/workspace/warehouse_db_2026-10-14.sql
```

确认 `.env` 的 `DATABASE_URL` 指向预期的本地库后，覆盖导入：

```powershell
node scripts/replace-from-mysql.mjs D:/workspace/warehouse_db_2026-10-14.sql --replace --backup=D:/workspace/database-backups/warehouse-20261014-mysql-replacement/before-replacement.dump --report=D:/workspace/database-backups/warehouse-20261014-mysql-replacement/import-report.json
```

报告路径必须不存在，避免覆盖既有报告。脚本只允许连接本机，必须提供 PostgreSQL custom 格式的现有备份和报告路径。它先生成临时表，在单个事务内清空、写入、逐字段双向比对、检查订单和采购关联，再提交；失败自动回滚。报告包含原始文件 SHA-256、行数、金额/数量合计、序列值和账号 ID 映射，不包含密码哈希。

## 恢复覆盖前的数据

本次覆盖前的完整库备份保存在：

`D:/workspace/database-backups/warehouse-20261014-mysql-replacement/before-replacement.dump`

原始 MySQL 备份副本也保存在同目录的 `source-mysql.sql`。先停止应用连接，再根据需要恢复：

```powershell
docker cp D:/workspace/database-backups/warehouse-20261014-mysql-replacement/before-replacement.dump renzhongsuliao-db-1:/tmp/warehouse-restore.dump
docker exec renzhongsuliao-db-1 pg_restore -U warehouse -d warehouse --clean --if-exists --single-transaction /tmp/warehouse-restore.dump
```

恢复完整备份也会恢复其 Prisma 迁移记录。应用仍使用新代码时，重新运行 `npm run db:migrate`，保持代码与数据库约束兼容。

## 验证

```powershell
node --test tests/mysql-dump.test.mjs
```

数据库集成测试需设置 `RUN_DATABASE_TESTS=1`，并将 `DATABASE_URL` 指向临时验证库：

```powershell
npx tsx --test tests/customer-directory.integration.test.ts tests/receivables.integration.test.ts
```

数据库测试只创建独立测试编号并清理，不应在迁移后的正式本地库运行，以免改变已校验的序列值。
