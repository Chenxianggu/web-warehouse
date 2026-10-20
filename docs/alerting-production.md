# 生产日志报警部署记录

部署日期：2026-10-20（Asia/Shanghai）。业务镜像为 `warehouse-app:v1.1.2`，发布源码提交为 `de79292b8c2f74fee1495e98b38827724297355b`。服务器目录 `/opt/warehouse`。

## 发布及验证

- [完整 CI](https://github.com/Chenxianggu/web-warehouse/actions/runs/39424778017) 通过：应用测试、报警测试、lint、类型检查、生产构建、日志采集/持久化及报警/恢复集成测试。
- [生产发布](https://github.com/Chenxianggu/web-warehouse/actions/runs/39425373532) 成功，应用已切换到 `v1.1.2`。
- 六条生产规则均已配置，并逐条通过真实 Loki 查询检查；日志与审计只读数据源健康。
- Grafana 文件夹和看板名称统一为“任仲塑料后台”；保留原看板 UID、数据库和日志卷。
- 通知服务健康、渠道已配置、待发送队列为零；无认证的 Webhook 请求返回 401。
- Grafana 仅监听 `127.0.0.1:3300`，通知服务仅监听 `127.0.0.1:3310`。
- 应用与通知容器健康；通过服务器本机 Nginx HTTPS 验证 `/login` 和 `/api/health` 均返回 200，健康接口返回 `{"status":"ok"}`。

部署后发现 standalone 服务默认使用 Docker 的容器 hostname 监听，导致容器内 `127.0.0.1` 探针连接失败，而宿主机发布端口正常。已在仓库和生产业务 Compose 增加 `HOSTNAME: "0.0.0.0"`，仅重建应用容器，复核其内外健康检查通过。此为发布后的运行配置修正，业务镜像仍为 `v1.1.2`；生产 `.env.prod` 的 `IMAGE_TAG` 已持久更新。

## 真实通知验收

执行 `ops/alerting/production-smoke.mjs --send`，测试编号 `prod-smoke-92d5912eab7d`。

1. 临时容器持续生成独立的生产标签测试日志，使用 `service_name=alert-smoke`，不会触发真实 app/db 的规则。
2. 临时规则复用生产业务异常规则的阈值，通过真实 Alloy → Loki → Grafana → 鉴权通知服务 → 钉钉签名请求发送。
3. **20:57:05**：钉钉接口确认接收报警，记录 `ALERT_DELIVERED`、`status=firing` 和对应测试编号。
4. 停止测试日志容器，等待 30 秒测试窗口消退。
5. **20:57:40**：钉钉接口确认接收恢复通知，记录 `ALERT_DELIVERED`、`status=resolved` 和相同测试编号。
6. 临时规则、文件夹和容器自动清理完成，未停止业务/数据库进行故障模拟，未写入业务数据。

用户于 2026-10-20 明确确认手机已收到报警和恢复两条通知，生产日志采集到手机接收的完整链路验收通过。后续复测命令见 [报警手册](./alerting.md) 的生产验收段落。

## 备份与回退

服务器保留 `/opt/warehouse/backups/pre-v1.1.2-20261020T124204Z/`，目录仅所有者可访问：

- `database.dump`：发布前 PostgreSQL 自定义格式备份，已通过 `pg_restore --list` 校验。
- `.env.prod`、业务与运维 Compose、`ops-config.tgz`：原配置及密钥备份，仅保存在服务器。
- `grafana-data.tgz`：Grafana 停止后备份的数据卷，包含原看板和配置数据库。

旧业务镜像 `v1.1.1` 保留。本次没有数据库结构变更；普通业务回退无需恢复数据库。回退到 `v1.1.1` 时需同时恢复备份中的业务 Compose（旧镜像没有 `/api/health`），并显式设置 `IMAGE_TAG=v1.1.1`，避免沿用新版本探针配置。

## 当前范围

现阶段只有一台业务服务器，按用户选择仅上线日志报警。外部存活监测器未部署，因此整台服务器断电、断网或监控栈一起停机时，当前服务器无法独立发出报警。后续有第二台长期在线机器后再部署外部监测。
