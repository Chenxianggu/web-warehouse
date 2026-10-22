# 客户订单日报

独立运维 Agent 每天上海时间 **08:00** 为前一天生成客户订单日报。程序查询固定的只读汇总视图，先保存业务快照，再调用 DeepSeek 选择摘要重点和建议。每日数字、客户名称和金额都由程序填入报告，模型不能输出或改写它们。

报告保存在运维卷中。生成完成后自动通过现有钉钉群机器人发送中文汇总：订单数、客户数、数量、金额、出库状态、未出库余额、操作变化、AI重点与建议。完整客户明细通过服务器命令查看。机器人发送到其所在群，手机是否提醒取决于群通知和系统设置。

## 数据与统计口径

| 内容 | 来源与口径 |
| --- | --- |
| 订单数、客户数、包数、吨数、金额 | 按订单业务日期，统计采集时仍存在的客户订单，包含已出库与未出库 |
| 客户明细 | 按客户编号合并，列出全部客户的数量、金额和出库状态；展示名称取该编号订单中的一个名称，不依赖客户主档外键 |
| 未出库余额 | 订单日期不晚于日报日期、采集时仍未出库的订单，不把未来订单纳入 |
| 新增、修改、删除 | 按上海时间当天零点至次日零点的审计事件；订单ID去重，不把明细重建当作新增订单 |
| 出库、取消出库 | 根据审计前后 `is_shipped` 的变化分别计次，反复出库与撤销不会互相抵消 |
| 日间比较 | 只使用已经保存的相邻前一天快照，不存在时明确显示没有比较基线 |

业务统计是“**该订单日期的数据，截至实际采集时的有效状态**”，不是对前一天午夜的历史还原。每份报告显示真实采集时间；首次上线或停机后补生成，也会明确保留实际时间。订单补录、删除、跨日修改、发货或物料换算更新，不会改写已经保存的数字或比较基线。

金额计算与当前订单详情采用相同公式：`单价 ÷ 每吨包数 × 包数`。数据库使用 NUMERIC，保留子分精度后汇总，金额显示两位小数，吨数显示六位。缺少物料或每吨包数非正时使用 40；归一化编号存在多个匹配时取最新 ID，避免联表倍增，并标记受影响明细数。此种资料冲突需要人工核对，不能宣称所有旧页面在冲突数据下都采用相同顺序。客户分项显示到分后相加可能与整体舍入差一分。

订单金额包含未出库订单和零单价明细，不等于销售收入、利润或应收。当前范围不包含整柜、寄存和收款；这些业务以后可按独立口径扩展。

审计统计仅反映实际采集且仍保留的记录，不能补回采集开始前或清理后的历史操作。正常业务入口共享关联编号，因此可以识别同一事务的明细重建；没有关联编号的直接 SQL 明细变更单独列出，避免误算为已确认的订单修改。

## 隔离与数据流

```text
orders / order_items / materials → reporting.customer_order_totals（只读聚合）
system_logs                     → reporting.order_activity_daily（只读聚合）
                                      ↓ 一致的只读事务
                              固定每日快照（本地数据卷）
                                      ↓
                     客户代号、核实数字、候选事实与建议编号
                                      ↓
                            DeepSeek 选择摘要重点
                                      ↓
                     程序恢复本地客户名称、渲染中文 Markdown
                                      ↓
                  已冻结的简报 → notifier 持久队列 → 加签钉钉机器人
```

`warehouse_order_reporter` 账号仅有两个聚合视图的 SELECT 权限，不能读取原始业务表、账号、审计快照或内部逐订单视图，也不能写业务数据。Agent 不接收数据库所有者密码；只挂载独立只读账号密码。查询是固定参数化 SQL，无任意 SQL 工具，使用一个连接和查询超时。

客户明细和快照完整保存在本地。钉钉收到经营汇总与重点客户名称、编号（仅当被选为重点时），不含地址、备注、原始日志或全量明细；请将机器人配置在有权查看经营数据的群。DeepSeek 只接收汇总事实、金额排名前十客户的稳定代号及允许的建议编号，不接收真实名称、编号、收货地址、备注、订单号或明细。摘要必须引用已有事实/建议编号；程序校验后填入所有实际数字，不能将模型文字当成统计来源。模型最多两次请求，每次输出最多 700 token，与异常诊断共用每日调用额度。

模型超时或额度耗尽时，已经保存的数字仍可查看。模型错误最多重试三轮；额度耗尽则延后检查。数据库查询失败不生成伪造的零订单报告。单份客户列表超过 5,000 个或状态文件超过 16 MiB 时拒绝新写入并暴露存储/采集失败，不静默截断统计。新任务进入时清理请求时间超过 180 天的日报；数据卷和密钥目录应一起备份。

## 首次部署与升级

先部署带迁移的业务版本，让迁移创建 `reporting` 视图。独立运维栈仍需单独升级：

```bash
# 完整源码目录；仅有 Docker 的服务器沿用日志手册的密钥初始化命令
npm run db:migrate
npm run ops:secrets

# 只在显式执行时使用数据库所有者密码初始化报表只读账号
docker compose --env-file .env.prod -f docker-compose.ops.yml run --rm order-reporter-init
```

在服务器 `.env.prod` 中加入：

```dotenv
ORDER_DAILY_ENABLED=true
ORDER_DAILY_AT=08:00
ORDER_DAILY_NOTIFY=true
ORDER_DAILY_ENVIRONMENT=production
```

然后重新构建并启用 Agent：

```bash
docker compose --env-file .env.prod -f docker-compose.ops.yml \
  --profile agent up -d --build --force-recreate agent notifier
```

Agent 新增了独立的小型运行镜像，只安装锁定的 PostgreSQL 驱动，不会安装整个业务应用。`ops/agent/Dockerfile` 与自己的包锁随 `ops/` 发布，密码文件不进入构建上下文。旧版 Agent 升级前同样需要先运行密钥初始化，创建 `order_reporter_password`。

本地开发去掉 `--env-file .env.prod`，设置本地 `.env`。`ORDER_DAILY_ENVIRONMENT` 默认为 `development`，消息明确标记“本地开发环境”；生产部署设为 `production`，测试可用 `testing`。创建只读账号时可由本地数据库连接提供 `POSTGRES_USER`、`POSTGRES_DB`、`POSTGRES_PASSWORD`；不要把生产密码写进命令记录。`AUDIT_DB_HOST` 默认为私有网络别名 `warehouse-db`，数据库名取 `POSTGRES_DB`，默认为 `warehouse`。

日报调度在常驻 Agent 中执行，每天达到设定时间后只入队一次；重启不会重复覆盖已生成报告。离线后只自动补最近的前一天，其他日期需手动申请。调度时区固定为 Asia/Shanghai，与服务器系统时区无关。

`ORDER_DAILY_NOTIFY` 默认 `true`，日报功能启用后，新生成的日报自动推送。须配置现有 `ops/.secrets/alert_channel.json` 中的钉钉机器人及加签密钥，配置方法见 [钉钉通知](./alerting.md)。旧版已经生成的报告不在升级后批量补发，可用下方 `notify` 命令按日期补发一次；该命令复用现成快照与摘要，不消耗模型调用。

Agent 与 notifier 分别持久保存提交、投递状态。认证接口仅在队列落盘后确认接收；Agent 定期查询状态，钉钉返回 `errcode=0` 后才标记 `delivered`。网络、签名或渠道错误保留队列，退避重试，上限五分钟。相同环境和日期的日报在队列及已投递记录中去重，已投递记录保留180天。普通断线重试与重启不会重复发送；若钉钉已接收后进程恰好在本地成功落盘前崩溃，仍存在再次发送的窄窗口，不能保证外部接口严格只收一次。设置 `ORDER_DAILY_NOTIFY=false` 并重建 agent 可暂停新的转交，但 notifier 已接收的消息仍会投递。

模型三轮失败或未配置时，有成功数字快照的日报仍推送，消息明确标记 AI 摘要暂不可用；数据库采集失败不会发送伪造零值。额度耗尽时等待额度恢复。后台程序与 Docker 必须持续运行，本地电脑休眠或关机时不能准时发送。

## 查看、补生成与重试

```bash
# 日报列表：日期、快照、AI状态、钉钉投递状态
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs list

# 中文日报（示例日期，按实际报告日期替换）
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs show 2026-10-19

# 原始数字快照与模型选择结果
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs json 2026-10-19

# 申请过去90天内已结束日期的日报；当天、未来日期和非法日期会被拒绝
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs request 2026-10-18

# 仅重试 disabled/unavailable 报告，复用已有数字快照；已完成的报告不覆盖
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs retry 2026-10-18

# 将已有日报提交钉钉队列；重复执行不会重复入队或覆盖日报
docker compose -f docker-compose.ops.yml exec agent node /opt/agent/daily-orders.mjs notify 2026-10-19

# 查钉钉实际接口投递记录（ALERT_DELIVERED，带 reportDate）
docker compose -f docker-compose.ops.yml logs --tail=50 notifier
```

导出时可以把 `show` 命令输出保存为 Markdown；PowerShell 建议使用 `| Set-Content -Encoding utf8 客户订单日报.md`。完整报告含客户和经营数据，应限制文件访问权限。

`snapshotReady=true, aiStatus=completed` 表示数字和模型摘要均已完成；`pending` 可能仍在采集或等待模型；`disabled/unavailable` 表示没有模型摘要。后两种状态如果 `snapshotReady=true`，仍可查看程序统计的完整日报。`notificationStatus` 分别为 `not-requested`（旧日报未申请推送）、`pending`（等待转交）、`queued`（通知服务已落盘，等待渠道）、`delivered`（钉钉接口确认接收，附 `deliveredAt` 时间戳）。接口接收不等于手机已提醒，需在机器人所在群确认。Agent `/health` 的 `dailyOrders` 字段暴露报告数、积压、不可用数量、`notificationPending` 和存储状态。无快照的失败不会展示为“当天零订单”。

## 验收

```bash
npm run test:order-daily
RUN_DATABASE_TESTS=1 npm run test:order-daily:db
docker compose -f docker-compose.ops.yml run --rm agent-verification
```

数据库测试使用独立临时数据库与临时只读角色，验证完后删除，不写现有业务数据。覆盖金额精度、换算缺失/重复、联表去重、审计新增修改删除、出库撤销、上海跨日边界、只读权限和原表隔离。单元及无网络容器测试覆盖调度、冻结快照、断点重试、共享调用额度、数据脱敏、模型输出校验，以及日报到通知服务的认证、丢失确认重试、钉钉拒绝处理、跨日重启去重与投递状态。测试使用模拟钉钉响应，不发送真实消息。
