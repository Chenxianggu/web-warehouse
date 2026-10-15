# 独立开发者日志平台

日志查看已移到独立的 Grafana。业务系统不再提供日志菜单、`/logs` 页面或 `/logs/export` 接口；业务超级管理员也没有运维后台账号。数据库审计采集继续工作。

## 组成与访问

- **运行排错**：应用及数据库容器 → 仅开放读取操作的 Docker API 代理 → Alloy → Loki → Grafana。
- **操作追溯**：业务事务中的 PostgreSQL 审计触发器 → `system_logs` → `observability.events` 只读视图 → Grafana。
- **独立身份**：Grafana 用户名 `developer`，随机密码单独保存，不使用业务账号。禁用匿名访问和公开注册。
- **独立生命周期**：`docker-compose.ops.yml` 固定使用 `warehouse-ops` 项目，与业务 Compose 分开。业务发布只更新运维配置文件，不自动重启运维栈。

Grafana 仅绑定服务器 `127.0.0.1:3300`，使用 SSH 隧道访问。Loki、Alloy、Docker API 代理和 PostgreSQL 不开放额外公网端口。Alloy 仅采集带 `io.renzhong.logs=true` 标签的容器，用户 ID、订单 ID 和关联编号保留在 JSON 中，不作为高基数索引标签。

## 首次在生产服务器启用

以下命令在业务服务器应用目录执行，例如 `/opt/warehouse`。先发布包含本次更改的业务版本，让容器入口完成数据库迁移，并创建共享的私有审计网络。不要在迁移完成前初始化只读账号。

业务发布流程会将 `ops/` 和 `docker-compose.ops.yml` 放到应用目录；`ops/.secrets/` 不进入 Git、应用镜像或发布包。

1. 首次生成密钥（服务器只安装 Docker 也能运行）。现有密钥不会覆盖：

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/ops:/ops" -w /ops \
  node:22-bookworm-slim node init-secrets.mjs
```

也可以在有 Node.js 的完整源码目录运行 `npm run ops:secrets`。密钥目录权限为 `0700`，文件可供容器用户读取；Windows 本地使用当前用户的文件访问控制。需要备份整个密钥目录，特别是 Grafana 的加密密钥。

2. 使用 `.env.prod` 中的数据库所有者密码，单次创建只读角色：

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml \
  run --rm audit-reader-init
```

这个容器只在显式执行时运行。Grafana 不接收数据库所有者的账号或密码。`warehouse_log_reader` 只有日志视图的查询权限，没有业务表的读取或审计表的写入权限，且设置连接数、查询超时和默认只读事务。重复运行可同步读者密码；不允许复用不相关角色或有其他角色成员关系的账号。

3. 启动运维栈：

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml \
  up -d grafana loki alloy docker-proxy
```

4. 在你自己的电脑建立隧道：

```bash
ssh -N -L 3300:127.0.0.1:3300 ubuntu@你的业务服务器
```

浏览器打开 `http://localhost:3300`。用户名为 `developer`；首次密码从服务器 `ops/.secrets/grafana_admin_password` 文件读取，首次登录后可在 Grafana 修改。不要把密码文件放进工单、截图或仓库。

Grafana 首次创建数据库时使用初始化密码，之后不会因改写密码文件自动重置账号。修改账号密码后，验证脚本需要先同步本地密码文件。`grafana_secret_key` 用于加密数据源凭据，应与 Grafana 数据卷一起备份。

## 本地开发启用

```powershell
npm run db:migrate
npm run ops:secrets
docker compose -f docker-compose.yml up -d db
```

本地数据库默认使用 `warehouse` 用户、数据库与密码。PowerShell 可以用以下命令初始化角色；生产必须改用上面的 `.env.prod` 方式：

```powershell
$env:POSTGRES_PASSWORD = 'warehouse'
docker compose -f docker-compose.ops.yml run --rm audit-reader-init
Remove-Item Env:POSTGRES_PASSWORD
docker compose -f docker-compose.ops.yml up -d grafana loki alloy docker-proxy
```

然后打开 `http://localhost:3300`。本地 Next.js 通常直接运行在宿主机，此时不会经过 Docker 采集；本地数据库容器仍会被采集。开发期间要观察应用实时输出，可查看开发终端；使用生产 Compose 中的应用容器时会自动进入 Loki。

同一 Docker 主机运行多套系统时，分别设置 `OBSERVABILITY_NETWORK`（业务和运维必须一致），并使用独立的运维项目名及 `GRAFANA_PORT`，避免多个数据库复用 `warehouse-db` 别名。

## 两个看板

- **仁众 · 运行排错**：环境、服务、日志级别、关键词或关联编号筛选；显示日志量、警告/错误数以及最近 1,000 条日志，支持详情和 Explore 查询。应用 JSON 中包含发布版本。
- **仁众 · 操作追溯**：类型、结果、业务模块、操作人、日志/对象/关联编号筛选；按时间查询最近 1,000 条事件。快照与附加信息列可以打开查看，表格检查器支持导出数据。

看板与数据源自动预置，无需手动导入。看板配置在 `ops/grafana/dashboards/`，数据源凭据在 Grafana 内加密保存，接口不会返回明文密码。需要调整看板时修改配置文件，避免直接改容器内文件。

## 采集范围与一致性

操作审计覆盖账号、菜单权限、客户、收货地址、物料、入库库存、价格表及授权、订单及明细、寄存、收款、整柜和采购到货的逐行新增、修改、删除。包含批量、级联及原生 SQL 写入。

业务写入使用 `auditTransaction(user, callback, options)` 传递已核实的账号身份。同一事务共享关联编号，审计与业务一起提交或回滚。直接数据库写入和自动同步标记为“系统”。新入口应继续使用这个方法，不能信任表单提交的操作人。无实际变化、只更新时间的更新不会重复记录。

成功登录、失败登录、退出和权限拒绝保存在审计库，同时输出结构化日志。认证日志数据库保存失败时，保留标准输出并不影响响应。系统运行异常仅输出标准日志，由 Alloy/Loki 独立保存，不再依赖业务数据库日志表。Next.js `onRequestError` 捕获未处理请求异常，框架和进程自身的输出也随容器采集。正常表单校验失败不生成数据库变更记录。

密码和会话字段不进入业务快照。结构化应用日志脱敏凭据，不记录请求正文、查询字符串或请求头；错误只保留类型、错误码和 digest，避免 SQL 参数泄露。业务快照仍有客户和价格等数据，仅供开发者运维使用。原有数据库运行日志继续可查，后续按保留期限清理。

## 保留、备份与维护

- Loki 默认保留 30 天，使用 TSDB、持久数据卷和 WAL。按时间清理，不会根据剩余磁盘容量自动删日志，需要关注磁盘空间。
- PostgreSQL 审计与认证默认保留 180 天；清理脚本默认只预览，显式 `--apply` 才删除。当前不创建自动删除任务。
- 应用、数据库和运维容器的标准输出启用 Docker 日志轮转。
- 备份 PostgreSQL、`warehouse-ops_grafana_data`、`warehouse-ops_loki_data`、`warehouse-ops_alloy_data` 和 `ops/.secrets/`。Alloy 数据卷保存读取位置。

完整源码目录可以运行：

```bash
npm run logs:prune
npm run logs:prune -- --apply
```

生产应用镜像也包含清理脚本，不需要服务器安装 Node.js：

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  run --rm app node scripts/prune-logs.mjs --apply
```

可用 `AUDIT_LOG_RETENTION_DAYS`、`RUNTIME_LOG_RETENTION_DAYS` 设置数据库保留天数，通过 `docker compose run -e ...` 传入。Loki 保留期单独在 `ops/loki/config.yml` 配置。日志只追加保护不阻止数据库所有者维护，本方案不宣称能抵御数据库管理员篡改。

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml ps
docker compose --env-file .env.prod -f docker-compose.ops.yml logs --tail=100 alloy loki grafana
```

先停止运维栈再删除业务网络；常规业务重启或发布不需要停止运维。不要用 `down -v` 删除持久日志数据。配置更新后单独运行运维栈的 `up -d`（必要时重启相关组件）。同机方案仍共享整台主机的故障域；需要主机故障隔离时，再将日志存储和 Grafana 迁到独立服务器。

## 验证

```bash
npm run test:logs
# 在可写测试数据库上创建独立标识的记录并清理
RUN_DATABASE_TESTS=1 npm run test:logs:db
# 运维栈启动后；只访问本机 Grafana，创建并清理一个测试日志容器
npm run ops:verify
npm run ops:verify -- --restart-loki
```

运维验证覆盖匿名访问限制、两个看板及数据源、日志视图可读、业务表不可读、日志不可写、容器到 Grafana 的日志链路，以及可选的 Loki 重启后日志可查。SQL 权限测试使用零行读取和零行删除，不会更改业务数据。

## 官方参考

- [Loki 部署模式](https://grafana.com/docs/loki/latest/get-started/deployment-modes/)
- [Alloy Docker 采集](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [Grafana PostgreSQL 只读账号](https://grafana.com/docs/grafana/latest/datasources/postgres/configure/)
- [Loki 文件存储与保留](https://grafana.com/docs/loki/latest/operations/storage/filesystem/)
