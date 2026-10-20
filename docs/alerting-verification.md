# 本地 Docker 报警链路验收

验收日期：2026-10-20（Asia/Shanghai）。范围为本地日志采集、规则评估、通知接收及持久队列，不包含生产部署或真实钉钉手机到达。

## 环境恢复

Docker Desktop 4.73.0 因失效的 `dockerInference`、`engine.sock` 临时 socket 无法启动。完整退出后，将仅包含 socket 的运行目录改名保留备份，确认新运行目录为空，再成功启动 Docker Engine 29.4.3。

- 临时目录：`%LOCALAPPDATA%/Docker/run`、`%LOCALAPPDATA%/docker-secrets-engine`。
- 同级保留 `.codex-backup-20261020-*` 备份，未执行恢复出厂、WSL 注销或删除数据卷。
- 本地 PostgreSQL 健康，18 项迁移已全部应用；本次未修改业务数据库结构。
- 已有 Grafana、Loki、Alloy 数据卷保留；新增通知密钥文件时保留所有已有密钥。

## 已验证结果

| 检查 | 结果 |
| --- | --- |
| Grafana 身份验证、禁止匿名读取 | 通过 |
| 运行排错、操作追溯两个看板及审计查询 | 通过 |
| 审计账号只读、无法读取业务表或写日志 | 通过 |
| 容器 JSON 日志 → Docker 只读代理 → Alloy → Loki → Grafana | 通过 |
| PostgreSQL 文本日志级别归一化 | 通过 |
| Loki 重启后原日志仍可查询 | 通过 |
| 六条生产报警规则预置及各自 LogQL 查询 | 通过 |
| 测试异常 → Grafana Firing → 认证 Webhook → 持久队列 | 通过 |
| 日志窗口到期 → Grafana Resolved → 恢复通知持久入队 | 通过 |
| 发送失败后退出容器，替换容器从共享数据卷继续投递 | 通过 |

执行命令：

```bash
npm run ops:verify -- --restart-loki
npm run ops:verify-alerting
```

验证使用临时测试规则、接收点、文件夹及带 `environment=test` 标签的日志容器。测试通知接收器不挂载钉钉渠道密钥；跨容器重试验证禁止联网，以模拟发送函数确认恢复投递。测试完成后清理临时资源及测试状态文件。

## 保留的运行状态与待验收项

Docker 和本地日志栈保持运行，Grafana 仅绑定 `127.0.0.1:3300`。本地通知渠道仍为 `unconfigured`，因此真实 `notifier` 的健康检查为 unhealthy，这是未填写钉钉密钥的预期状态；隔离测试不受影响。

尚未发送真实手机消息，未连接生产，也未部署独立监测主机。真实钉钉签名与到达、手机通知权限、独立主机检测生产停机及恢复，仍按 [手机报警手册](./alerting.md) 在配置真实渠道后验收。不能将本地模拟投递等同于钉钉或手机已接收。
