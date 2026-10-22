# 钉钉手机报警

支持本地验证和按需生产部署。普通集成验证不发送手机消息；显式带 `--send` 的验收命令会发送真实钉钉消息。实施计划见 [alerting-plan.md](./alerting-plan.md)。

可选 [只读诊断 Agent](./log-agent.md) 在原始报警落盘后异步分析，模型故障不会阻塞手机发送。升级需先重新运行密钥初始化，再重建通知服务；Agent 默认关闭。

## 消息模板与展示名称

产品展示统一使用“任仲塑料后台”。钉钉报警/恢复消息模板在 `ops/alerting/notification.mjs` 的 `grafanaNotice`；独立存活监测消息在 `ops/alerting/monitor.mjs` 的 `transition`。修改模板后重新创建 `notifier`；外部监测主机需单独更新并重建 `monitor`。已经发送或保存到队列中的消息不会被追溯修改。

Grafana 看板标题在 `ops/grafana/dashboards/runtime.json`、`audit.json`，看板文件夹在 `ops/grafana/provisioning/dashboards/dashboards.yml`，生产报警文件夹在 `ops/grafana/provisioning/alerting/warehouse.json`，数据源名称在 `ops/grafana/provisioning/datasources/datasources.yml`。显示名称变更保留原有 UID；现有文件夹先通过 Grafana 重命名，再重新加载配置，并递增看板 JSON 的 version 以重新应用文件夹归属。旧空文件夹确认没有看板、子文件夹和报警后再清理。

数据源配置包含旧英文名称的 `deleteDatasources` 迁移项：先移除旧连接定义，再按原 UID 创建新名称的连接，避免同 UID 冲突；不删除 Loki 日志或 PostgreSQL 数据。

## 链路与规则

```text
业务事务异常 / 请求异常 / 数据库日志 / 认证日志
  → Alloy → Loki → Grafana 生产报警规则
  → 内网认证 Webhook → 持久通知队列 → 加签钉钉机器人 → 手机

另一台主机：HTTPS /api/health（实际 SELECT 1）
  → 连续失败/恢复判断 → 独立持久通知队列 → 钉钉 → 手机
```

每 30 秒评估一次，仅匹配 `environment="production"` 的日志。

| 规则 | 触发条件 | 级别 |
| --- | --- | --- |
| 数据库连接不可用 | 2 分钟内 `DATABASE_UNAVAILABLE` ≥ 1 | critical |
| 认证日志保存失败 | 5 分钟内 `LOG_STORAGE_FAILED` ≥ 1 | critical |
| 后台请求异常增多 | 5 分钟内 `REQUEST_ERROR` ≥ 5 | warning |
| 业务写入连续异常 | 单个模块 5 分钟内 `BUSINESS_WRITE_FAILED` ≥ 3 | warning |
| 数据库错误增多 | PostgreSQL 5 分钟内 ERROR/FATAL/PANIC ≥ 3 | warning |
| 登录失败异常增多 | 5 分钟内 `LOGIN_FAILED` ≥ 10 | warning |

首次触发后等待 10 秒聚合，同组变更最少间隔 1 分钟，持续报警每 30 分钟提醒。队列另对同一事件抑制 5 分钟内重复投递。恢复通知开启；日志规则恢复只说明滑动窗口阈值解除，并不证明根因已消除。健康监测恢复则要求接口与数据库连续检查成功。

规则在 `ops/grafana/provisioning/alerting/warehouse.json`，直接绑定 `warehouse-mobile` 接收点，不覆盖已有全局通知策略。修改后需重启 Grafana。无匹配日志视为零次；数据源查询失败保留 Grafana Error 报警。日志停止产生不能等同于采集链路正常。

## 业务埋点与健康检查

- 审计事务失败会输出结构化错误，订单、出库、收款、寄存、采购、整柜带具体模块名，其他审计事务使用“业务事务”。事务审计和失败日志共享关联编号。
- 正常 `ok:false` 校验结果，以及预期的唯一性、外键和记录不存在错误（P2002/P2003/P2025）不生成运行报警；数据库不可用单独升级。原错误继续向调用方抛出，不改变提交/回滚行为。
- 同一错误对象在事务与 Next.js 异常钩子之间去重。错误仅保存类型、码、digest，不保存 SQL 参数、堆栈或错误正文。
- `/api/health` 为公开、不缓存的只读探针，返回 `200 {"status":"ok"}` 或 `503 {"status":"unavailable"}`；不返回版本、连接串、异常详情或业务数据。使用独立最大 1 个连接的连接池，连接与查询均有超时。
- 手机消息只使用固定规则摘要、模块、等级、次数及时间。详细日志继续留在私有 Grafana，不发送客户信息或业务快照。

## 业务服务器启用

先按 [日志平台手册](./logging.md) 部署应用与日志栈，等待数据库迁移完成。升级旧运维栈时也必须重新运行密钥初始化：新建缺失文件，保留已有文件和密码。

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/ops:/ops" -w /ops \
  node:22-bookworm-slim node init-secrets.mjs
```

在钉钉报警群添加自定义机器人，安全设置选择“加签”，保存 Webhook 和签名密钥。用服务器编辑器填写 `ops/.secrets/alert_channel.json`：

```json
{
  "channel": "dingtalk",
  "webhook": "https://oapi.dingtalk.com/robot/send?access_token=替换为真实值",
  "secret": "SEC替换为真实签名密钥"
}
```

初始化文件为只读，编辑前临时调整权限，编辑完成后还原；不要在命令行参数、聊天或 CI 输出中粘贴真实值。

```bash
chmod u+w ops/.secrets/alert_channel.json
# 用服务器编辑器编辑上面的文件
chmod 444 ops/.secrets/alert_channel.json

docker compose --env-file .env.prod -f docker-compose.ops.yml \
  up -d grafana loki alloy docker-proxy notifier
```

`alert_webhook_token` 是独立生成的 Grafana → 通知服务凭据，不是钉钉签名密钥。Grafana 和通知服务均从 secret 文件读取。通知服务只绑定服务器 `127.0.0.1:3310`，不需要新增公网端口；Grafana 仍仅通过 SSH 隧道访问。出站网络需可访问钉钉 HTTPS。

默认 `channel: unconfigured` 不会发送手机消息，服务健康检查返回 503，收到的通知仍排队。配置文件修改后重建通知服务；若轮换内网 token，也须同步重建 Grafana。

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml up -d --force-recreate notifier
curl --fail http://127.0.0.1:3310/health
docker compose --env-file .env.prod -f docker-compose.ops.yml logs --tail=50 notifier
```

健康响应含 `configured`、`pending`、`storageFailed`。未配置渠道、存储失败或队首等待超过 15 分钟会返回 503。Docker 的 unhealthy 状态不会自动发手机消息或自动重启服务，需要运维关注；通知渠道本身故障时，同一渠道无法报告自己的失败。

队列位于 `warehouse-ops_alert_data`，5 秒开始指数退避，最多间隔 5 分钟，持续重试；单实例 FIFO 保证报警在恢复通知之前。积压上限 1,000 条，满队列或保存失败时 Webhook 返回 503，由上游重试。不删除旧的未发送消息，恢复配置后会继续发送。平台已接收但进程未记录成功时崩溃，可能重复一条，属于至少一次投递。请备份该数据卷，不要使用 `down -v`。

## 外部主机启用

必须使用业务服务器以外的另一台机器，且保持在线。把 `docker-compose.monitor.yml`、`ops/alerting/` 和已填写的 `ops/.secrets/alert_channel.json` 安全复制过去，保持密钥目录只允许部署用户访问。监测器不需要 Grafana、数据库账号或 Docker socket。

```bash
export TARGET_HEALTH_URL=https://yinfengsuliao.com/api/health
docker compose -f docker-compose.monitor.yml up -d
docker compose -f docker-compose.monitor.yml logs --tail=50 monitor
```

每 30 秒检查一次，8 秒超时，拒绝重定向和非健康 JSON。连续 3 次失败发送报警，连续 2 次成功发送恢复；持续故障每 30 分钟提醒。包含网络、TLS、Nginx、应用和数据库不可用，无法仅凭探针确定根因。独立数据卷 `warehouse-external-monitor_monitor_data` 同时保存检查状态和通知队列，重启保留故障状态。使用同一卷时不得运行多个监测器或更换监测目标。

该探针不代表所有业务功能正常，也不覆盖磁盘空间、CPU、备份成功或 Grafana/Alloy 自身停机；后续可增加对应指标和独立监控。它能在业务服务器整机宕机时报警，但外部监测主机自身也需要保持可用。

## 验证与手机验收

无需 Docker 或真实密钥的测试：

```bash
npm run test:alerting
npm run test:logs
npm run typecheck
npm run lint
npm run build
docker compose -f docker-compose.ops.yml --profile verification config --quiet
```

在包含 Node.js 的完整源码目录、Docker 日志栈运行后，隔离验证不会给真实手机发送消息：

```bash
npm run ops:verify
npm run ops:verify-alerting
```

后者先通过两个禁止联网的独立容器、共享验证数据卷，确认第一次发送失败后，替换容器仍可读取通知并继续投递；随后检查六条生产规则已经预置且 LogQL 可查询，并临时创建独立测试规则、测试接收点、测试文件夹和日志容器。使用没有手机密钥的接收服务验证报警及恢复通知进入持久队列，最后清理测试资源。验证数据卷独立于真实通知队列，每次运行清理自己的测试状态文件。CI 已接入该检查。不要同时运行多个相同验证任务。最近一次本地实测见 [验收记录](./alerting-verification.md)。

配置真实渠道并确认通知服务健康后，显式试发：

```bash
npm run alerts:test -- --send
```

服务器只有 Docker 时也可以在应用目录运行：

```bash
docker run --rm --network host \
  -v "$PWD/ops/alerting:/work/alerting:ro" \
  -v "$PWD/ops/.secrets/alert_webhook_token:/work/.secrets/alert_webhook_token:ro" \
  node:22-bookworm-slim node /work/alerting/test-mobile.mjs --send
```

该命令通过真实通知服务发送两条测试通知（报警、恢复），不会制造业务错误。命令成功仅表示已持久排队；还需看到 `ALERT_DELIVERED` 并在手机确认两条通知均到达，检查钉钉通知权限、群免打扰和系统勿扰设置。真实端到端验收还需在受控维护时段确认外部监测器能发现停机和恢复。

## 生产环境模拟报警

部署并配置渠道后，可在生产应用目录运行完整链路验收：

```bash
docker run --rm --network host --memory 128m \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/ops/alerting:/opt/alerting:ro" \
  -v "$PWD/ops/grafana:/opt/grafana:ro" \
  -v "$PWD/ops/.secrets/grafana_admin_password:/run/secrets/grafana_admin_password:ro" \
  node:22-bookworm-slim node /opt/alerting/production-smoke.mjs --send
```

这是需要 Docker 管理员权限的一次性运维命令，不能作为公开接口运行或给普通通知服务挂载 Docker socket。测试临时创建独立规则和禁止联网的日志容器，使用 `environment=production`、独立 `service_name=alert-smoke` 和唯一验收编号；不访问业务表、不停止应用/数据库，也不会计入现有 app/db 报警规则。

模拟异常持续达到阈值后，临时规则通过真实 `warehouse-mobile` 接收点发送明确标注“生产验收测试”的通知。脚本检查该验收编号的 `ALERT_DELIVERED`，确认钉钉接口已接收报警后，仅停止测试日志源；窗口到期后再确认恢复通知已被钉钉接收。结束时清理临时规则、文件夹和容器。接口接收成功仍需手机侧确认实际提醒。

## 官方参考

- [Grafana 报警文件配置](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)
- [Grafana 通知配置示例](https://github.com/grafana/grafana/blob/main/conf/provisioning/alerting/sample.yaml)
- [钉钉自定义机器人安全设置](https://open.dingtalk.com/document/robots/customize-robot-security-settings)
