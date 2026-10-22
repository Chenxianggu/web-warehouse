# 报警只读诊断 Agent（第一阶段）

Agent 是独立的 Node.js 运维容器，不依赖业务进程。接收现有六类生产报警，查询 Loki 运行日志，通过受控工具调用生成有证据编号的中文报告。第一阶段通过服务器命令查看报告，便于人工核对诊断质量；问答页面、业务审计查询、手机 AI 摘要及自动修复不在本阶段。

可选的 [客户订单日报](./order-daily.md) 使用独立只读聚合账号统计订单与审计变化，保存每日快照并由 DeepSeek 选择摘要。异常诊断工具仍不读取业务表或审计明细。

## 链路

```text
Grafana → notifier 同一次原子落盘
                    ├→ 原有通知队列 → 钉钉
                    └→ 待转交分析队列 → 认证内网 HTTP → Agent 持久任务队列
                                                          ↓
                                              Loki 白名单查询、固定排障说明
                                                          ↓
                                              DeepSeek Responses 受控工具循环
                                                          ↓
                                              校验证据引用 → 本地 JSON 报告
```

Webhook 接口在通知和待转交任务落盘后返回 202；待转交任务与原有通知位于同一通知状态文件，转交 worker 与手机发送 worker 分开执行。Agent 只有在自己的任务落盘后才返回 202。转交成功后才删除 notifier 中的任务；连接失败独立退避重试，超时 5 秒。模型调用不在报警请求或手机发送路径中。

两级分析队列各最多 100 个任务。Agent 队列满时返回 503，notifier 保留任务重试；notifier 待转交队列已满时仍接收原始报警，增加 `analysisDropped` 计数。超过 24 小时的待转交任务清除并计入该计数；Agent 中过期任务产生失败报告。磁盘损坏仍可能影响服务，不能把同一服务器上的队列当成整机容灾。

仅处理已知名称且带 `application=warehouse,environment=production` 的 firing 报警。恢复通知、未知报警和带 `verification_id` 的验收报警继续走原有通知路径，不触发 AI。按规则、模块、首次触发时间合并同一故障，7 天内重复通知不重新分析；真正的新故障首次触发时间不同，会产生新报告。组合报警集合变化可能产生另一份报告。

## 模型配置

本地实现和隔离验收不需要真实模型密钥。默认 `LOG_AGENT_ENABLED=false`，模型模板默认 `enabled=false`。首次启用前在 [DeepSeek 开放平台](https://platform.deepseek.com/) 申请 API Key，填入本地密钥文件；不要把密钥发送到聊天、提交 Git 或放入普通环境示例文件。

完整源码目录执行：

```bash
npm run ops:secrets
```

生产服务器只有 Docker 时，在应用目录执行现有初始化方式：

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/ops:/ops" -w /ops \
  node:22-bookworm-slim node init-secrets.mjs
```

这会生成 `ops/.secrets/agent_webhook_token` 和 `ops/.secrets/agent_model.json`，不会覆盖已有密钥。升级后即使暂不启用 Agent，也应先初始化新密钥再重建 notifier，因为 Compose 新增了该密钥挂载。

编辑 `ops/.secrets/agent_model.json`：

```json
{
  "enabled": true,
  "model": "deepseek-flash",
  "apiKey": "填写自己的DeepSeek API Key",
  "dailyCallLimit": 40
}
```

Linux 初始化文件是只读权限，可先 `chmod u+w ops/.secrets/agent_model.json`，使用编辑器修改后恢复 `chmod 444 ops/.secrets/agent_model.json`。密钥目录保持 `0700`。Windows 使用文件属性与当前用户访问控制管理写权限。

模型服务固定为 DeepSeek，只调用 `https://api.deepseek.com/responses`，代码中没有其他模型服务的调用路径。默认模型为 `deepseek-flash`，也可填写 `deepseek-v4-pro`；配置校验只接受这两个官方模型 ID。现有文件会被密钥初始化脚本保留，升级时请把旧模板的空模型名改为 `deepseek-flash`，并填写 DeepSeek API Key。

接口使用 DeepSeek Responses 的函数工具和 JSON Schema 输出。显式设置 `reasoning.effort=none`、`stream=false`，以减少分析等待并将输出额度用于报告。每次请求回传本次任务的完整对话历史；接口按无状态方式使用，不依赖服务端会话 ID。模型返回多个工具调用时，服务端先校验名称、参数 JSON 和调用编号，再在剩余额度内顺序执行并逐个回传结果，不依赖供应商的并行开关。工具参数及报告证据仍在本地独立校验。

不发送该接口不支持的 `store`、`include`、`parallel_tool_calls` 等请求参数。接口无状态不等于对提供商所有日志保留政策作出保证。模型可用性及实际输出质量仍需使用真实配置验收。

默认每个分析尝试最多 4 次模型请求、6 次工具调用（含预先查询 app/db 的两次），总超时 90 秒。每次请求最多 1,800 个输出 token，请求正文最多 100 KiB。每日最多 40 次请求，可配置为 1–200；按 Asia/Shanghai 零点重置。调用前持久化额度预占，网络失败和服务重启也计入额度。这里限制的是请求数和单次输出量，不是人民币费用，实际费用取决于配置的模型和输入量。达到额度的任务延后至次日，仍受 24 小时任务有效期限制。

## 启用与检查

生产在服务器 `.env.prod` 中加入：

```dotenv
LOG_AGENT_ENABLED=true
```

业务版本发布仍不会自动重启运维栈。单独启动 Agent 并重建 notifier：

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml \
  --profile agent up -d agent notifier
docker compose --env-file .env.prod -f docker-compose.ops.yml ps agent notifier
```

本地开发使用相同命令时去掉 `--env-file .env.prod`，通过本地 `.env` 设置开关。也可以只启动 `agent` 检查容器及 Loki 连接，此时不必打开 `LOG_AGENT_ENABLED`。

Agent 不映射主机端口，不挂载 Docker socket、业务数据库凭据或钉钉密钥。只连接日志查询与出站模型请求需要的网络，根文件系统只读，状态写入独立的 `warehouse-ops_agent_data` 卷。每个状态文件仅允许一个进程写入，不要横向扩容该容器。

检查服务状态与查询能力（不触发报警、不调用模型）：

```bash
docker compose -f docker-compose.ops.yml exec agent node -e \
  "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(console.log)"
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/verify-loki.mjs
```

`/health` 返回 `configured`、启停状态、待处理数量、报告数量、当日模型调用次数和存储失败标记。模型未配置时显示 `disabled`，不会消耗调用额度；未配置但有积压、或启用后任务滞留超过 15 分钟，健康检查变为失败。notifier 的 `/health` 额外显示 `analysisPending` 和累计 `analysisDropped`；它们不改变原有手机通知健康判断。

仅接口与状态卷就绪不代表模型调用已验收。真实验收应在模型配置后观察一次实际生产报警生成的报告；现有生产手机验收脚本带 `verification_id`，按设计不会产生 AI 报告，不可拿它证明模型正常。

## 查看报告

```bash
# 列出最近的报告编号、时间、结果和摘要
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/reports.mjs list

# 使用上一步返回的完整64位编号
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/reports.mjs show <report-id>
```

报告包含事实、原因假设、可信度、人工检查步骤、限制、脱敏证据、查询表达式和时间范围、`provider=deepseek`、模型 ID、模型请求次数。每条事实必须引用实际存在的证据编号，未知编号会被拒绝；编号校验不能代替人工判断因果关系。报告中出现的任何操作建议都只是文本，不会自动执行。

报告格式或证据引用不符合要求时，会在单次分析最多 4 次模型请求的额度内反馈固定校验原因，要求模型纠正；不放宽证据校验。没有日志样本时事实列表必须为空。纠正后仍未通过的分析最多尝试 3 次，之后保存 `failed` 报告和固定失败说明；诊断日志仅保留预定义原因码、错误类型、HTTP 状态等信息，不保存提供商原始错误响应。生成报告时保留最近 7 天内最多 100 份，去重记录上限 2,000。没有新任务时不会定时清理旧报告；备份 Agent 数据卷和 `ops/.secrets/`。报告无 HTTP 公共读取接口，仅通过具备服务器权限的命令读取。

## 数据边界与诊断限制

- 日志窗口固定为报警接收前 15 分钟，每次最多读取 80 条记录，只允许服务、已知关联编号和固定手册主题参数，模型不能输入 SQL、LogQL、URL 或文件路径。
- app 日志仅投影已有标准 action、模块、级别、规范版本、UUID 关联编号、错误类型/错误码/数字 digest。丢弃自由文本、姓名、账号、请求参数、业务快照和任意 metadata。
- db 日志只保留时间、服务、严重程度；原始文本及 SQL 全部省略。当前没有接入 PostgreSQL 审计视图，因此没有业务数据库连接信息。
- 数据与模型输出都按不可信输入处理，工具名称和参数在服务端校验。仅有模型提示词并不授予权限。
- 当前没有完整堆栈、源码行号、主机指标或外部存活监测数据，不能保证定位代码行或确认根因。Loki 返回空样本不等于服务健康。

## 验证与停用

```bash
npm run test:agent
npm run test:alerting

# 无外网、无模型/钉钉密钥的真实 Docker 验收
docker compose -f docker-compose.ops.yml run --rm agent-verification

# 只读检查当前 Loki API；不用启动常驻 Agent
docker compose -f docker-compose.ops.yml run --rm --no-deps agent node /opt/agent/verify-loki.mjs
```

测试覆盖完整认证 Webhook → 落盘 → 转交 → DeepSeek 工具循环 → 引用验证 → 报告落盘链路；模型和 Loki 使用回环 HTTP 测试服务，不会调用真实 AI 或发送手机通知。也覆盖 DeepSeek 参数兼容、多工具结果配对、额度耗尽后关闭工具、重启后重试/去重/预算、队列满和写盘失败、隐私投影、工具越权及输入大小限制。CI 同时执行宿主机测试与禁止外网的容器测试。

停用时将 `.env.prod` 的 `LOG_AGENT_ENABLED=false`，并将模型文件的 `enabled=false`，然后分别重建 notifier 和 agent。模型配置只在进程启动时读取。保留数据卷便于复查；已存入 Agent 的任务会等待再次启用，超过有效期后生成失败报告。不要使用 `down -v` 删除历史状态。

官方接口依据：[DeepSeek Responses API](https://api-docs.deepseek.com/zh-cn/api/create-response/)、[参数兼容说明](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)、[Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)。
